package live

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
)

var ErrProductionStaging = errors.New("production staging is refused")

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
