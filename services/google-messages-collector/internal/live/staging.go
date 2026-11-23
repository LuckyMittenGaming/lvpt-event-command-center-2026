package live

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
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
		payload = append(payload, map[string]any{
			"googleMessageId": record.GoogleMessageID,
			"conversationId":  record.ConversationID,
			"transport":       record.Transport,
			"direction":       record.Direction,
			"timestampMs":     record.TimestampMs,
			"contactHash":     record.ContactHash,
			"bodyCiphertext":  record.BodyCiphertext,
		})
	}
	encoded, err := json.Marshal(map[string]any{"records": payload})
	if err != nil {
		return err
	}
	if bytes.Contains(bytes.ToLower(encoded), []byte("cookie")) || bytes.Contains(encoded, []byte("preview")) {
		return errors.New("staging payload contained forbidden material")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(encoded))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("x-lvpt-sms-sync-token", token)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return errors.New("staging ingest was not accepted")
	}
	return nil
}
