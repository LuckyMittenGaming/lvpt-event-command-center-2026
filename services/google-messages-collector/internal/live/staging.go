package live

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

var ErrProductionStaging = errors.New("production staging is refused")

// Status-category errors for ConfirmAllowlist. Text is fixed so a failure
// cannot echo a token, key, contact hash, phone number, response body, or
// transport error (those often contain the request URL).
var (
	errAllowlistTokenShort   = errors.New("staging allowlist check refused: local token is too short")
	errAllowlistLocalHash    = errors.New("staging allowlist check refused: local contact hash is invalid")
	errAllowlistAuth         = errors.New("staging allowlist check refused: HTTP 401 authentication failed")
	errAllowlistForbidden    = errors.New("staging allowlist check refused: HTTP 403 forbidden")
	errAllowlistUnconfigured = errors.New("staging allowlist check refused: HTTP 503 server unconfigured")
	errAllowlistHashMismatch = errors.New("staging allowlist check refused: HTTP 200 allowed is false")
	errAllowlistNonJSON      = errors.New("staging allowlist check refused: response was not JSON")
	errAllowlistTransport    = errors.New("staging allowlist check refused: transport failure")
	errAllowlistMalformedOK  = errors.New("staging allowlist check refused: malformed server ok")
	errAllowlistUnexpected   = errors.New("staging allowlist check refused: unexpected HTTP status")
)

// allowlistClient is replaced by offline tests so classification never dials a
// public staging host. The collector leaves it as the default client.
var allowlistClient = http.DefaultClient

func ValidateStagingURL(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" || parsed.Path != "/api/sms/staging/rcs-ingest" {
		return errors.New("staging ingest URL is not the RCS path")
	}
	if parsed.Hostname() == "lvpt-event-command-center-2026.vercel.app" {
		return ErrProductionStaging
	}
	if parsed.Scheme == "https" || parsed.Hostname() == "127.0.0.1" {
		return nil
	}
	return errors.New("staging ingest URL is not local or staging")
}

func PostStaging(ctx context.Context, endpoint, token string, records []Record) error {
	if err := ValidateStagingURL(endpoint); err != nil {
		return err
	}
	if len(token) < 32 {
		return errors.New("staging token missing")
	}
	payload := make([]map[string]any, 0, len(records))
	for _, record := range records {
		meta := strings.ToLower(record.GoogleMessageID + record.ConversationID + record.Source + record.Transport + record.Direction + record.ContactHash)
		if strings.Contains(meta, "cookie") || strings.Contains(meta, "preview") || record.SchemaVersion != 1 || record.BodyNonce == nil {
			return errors.New("staging payload contained forbidden material")
		}
		payload = append(payload, map[string]any{
			"schemaVersion":   record.SchemaVersion,
			"source":          record.Source,
			"tenantId":        "lvpt-owner-pilot",
			"googleMessageId": record.GoogleMessageID,
			"conversationId":  record.ConversationID,
			"transport":       record.Transport,
			"direction":       record.Direction,
			"timestampMs":     record.TimestampMs,
			"contactHash":     record.ContactHash,
			"bodyNonce":       base64.StdEncoding.EncodeToString(record.BodyNonce),
			"bodyCiphertext":  base64.StdEncoding.EncodeToString(record.BodyCiphertext),
		})
	}
	encoded, err := json.Marshal(map[string]any{"records": payload})
	if err != nil {
		return err
	}
	var last error
	for attempt := 0; attempt < 2; attempt++ {
		status, err := postOnce(ctx, endpoint, token, encoded)
		if err == nil && status == http.StatusOK {
			return nil
		}
		last = err
		if status != 0 && status != http.StatusBadGateway && status != http.StatusServiceUnavailable {
			break
		}
	}
	if last == nil {
		last = errors.New("staging ingest was not accepted")
	}
	return last
}

func ConfirmAllowlist(ctx context.Context, endpoint, token, contactHash string) error {
	if err := ValidateStagingURL(endpoint); err != nil {
		return err
	}
	if len(token) < 32 {
		return errAllowlistTokenShort
	}
	if len(contactHash) != 64 {
		return errAllowlistLocalHash
	}
	encoded, err := json.Marshal(map[string]string{"contactCheck": contactHash})
	if err != nil {
		return errAllowlistTransport
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(encoded))
	if err != nil {
		return errAllowlistTransport
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("x-lvpt-rcs-sync-token", token)
	response, err := allowlistClient.Do(request)
	if err != nil {
		return errAllowlistTransport
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 1024))
	if err != nil {
		return errAllowlistTransport
	}
	return classifyAllowlistResponse(response.StatusCode, body)
}

func classifyAllowlistResponse(status int, body []byte) error {
	switch status {
	case http.StatusUnauthorized:
		return errAllowlistAuth
	case http.StatusForbidden:
		return errAllowlistForbidden
	case http.StatusServiceUnavailable:
		return errAllowlistUnconfigured
	case http.StatusOK:
		return classifyAllowlistOK(body)
	default:
		return unexpectedAllowlistStatus(status)
	}
}

func classifyAllowlistOK(body []byte) error {
	if !json.Valid(body) {
		return errAllowlistNonJSON
	}
	var parsed struct {
		OK      *bool `json:"ok"`
		Allowed *bool `json:"allowed"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil || parsed.OK == nil || !*parsed.OK {
		return errAllowlistMalformedOK
	}
	if parsed.Allowed == nil {
		return errAllowlistMalformedOK
	}
	if !*parsed.Allowed {
		return errAllowlistHashMismatch
	}
	return nil
}

func unexpectedAllowlistStatus(status int) error {
	if status < 100 || status > 599 {
		return errAllowlistUnexpected
	}
	return fmt.Errorf("%w %d", errAllowlistUnexpected, status)
}

func ResolveContact(fromEnv, fromFile string) (string, error) {
	envContact := normalize(fromEnv)
	fileContact := normalize(fromFile)
	if envContact != "" && fileContact != "" && envContact != fileContact {
		return "", errors.New("local allowlist does not match the supplied contact")
	}
	if envContact == "" && fileContact == "" {
		return "", errors.New("contact allowlist must contain one contact")
	}
	if envContact != "" {
		return envContact, nil
	}
	return fileContact, nil
}

func postOnce(ctx context.Context, endpoint, token string, encoded []byte) (int, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(encoded))
	if err != nil {
		return 0, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("x-lvpt-rcs-sync-token", token)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, response.Body)
	if response.StatusCode != http.StatusOK {
		return response.StatusCode, errors.New("staging ingest was not accepted")
	}
	return response.StatusCode, nil
}
