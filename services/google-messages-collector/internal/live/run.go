package live

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"lvpt.local/google-messages-collector/internal/pairui"
	"lvpt.local/google-messages-collector/internal/preflight"
)

var (
	ErrNotConfirmed       = errors.New("owner confirmation missing")
	ErrAllowlistMissing   = errors.New("contact allowlist missing")
	ErrWindowClosed       = errors.New("authorization window is closed")
	ErrDisconnected       = errors.New("disconnected")
	ErrCredentialsExpired = errors.New("credentials expired")
)

type Head struct {
	ID      string
	Phone   string
	Preview string
}

type Event struct {
	GoogleMessageID string
	ConversationID  string
	Transport       string
	Direction       string
	TimestampMs     int64
	Phone           string
	Body            string
}

type Gateway interface {
	Pair(context.Context, map[string]string, func(string)) error
	SessionMaterial() ([]byte, error)
	List(context.Context) ([]Head, error)
	Fetch(context.Context, string) ([]Event, error)
	Disconnect()
	Reconnect(context.Context) error
}

type Bundle struct {
	Approved      bool
	GoogleAccount string
	Contact       string
	WindowStart   time.Time
	WindowEnd     time.Time
	Cookies       map[string]string
}

type Record struct {
	GoogleMessageID string
	ConversationID  string
	Transport       string
	Direction       string
	TimestampMs     int64
	ContactHash     string
	BodyCiphertext  []byte
	BodyNonce       []byte
	SchemaVersion   int
	Source          string
}

type Health struct {
	Connected           bool   `json:"connected"`
	LastSuccess         string `json:"lastSuccess"`
	LastFailure         string `json:"lastFailure"`
	Reconnects          int    `json:"reconnects"`
	Stored              int    `json:"stored"`
	FilteredPreviews    int    `json:"filteredPreviews"`
	SendCalls           int    `json:"sendCalls"`
	MarkReadCalls       int    `json:"markReadCalls"`
	GoogleSessionOpened bool   `json:"googleSessionOpened"`
	Stopped             bool   `json:"stopped"`
}

type Request struct {
	OwnerConfirm bool
	Bundle       Bundle
	Allow        []string
	Now          time.Time
	Log          io.Writer
	EmojiOut     io.Writer
	Protector    pairui.Protector
	SessionPath  string
	Repo         string
	ControlDir   string
	HealthPath   string
	StagingKey   []byte
	Sink         func([]Record) error
}

func Run(ctx context.Context, gateway Gateway, req Request) (Health, error) {
	health := Health{SendCalls: 0, MarkReadCalls: 0}
	if len(req.StagingKey) != 0 && len(req.StagingKey) != 32 {
		return health, finish(req, health, errors.New("staging encryption key is missing"))
	}
	if !req.OwnerConfirm || !req.Bundle.Approved || strings.TrimSpace(req.Bundle.GoogleAccount) == "" {
		return health, finish(req, health, ErrNotConfirmed)
	}
	if !allowMatches(req.Allow, req.Bundle.Contact) || len(requiredCookies(req.Bundle.Cookies)) != 6 {
		return health, finish(req, health, ErrAllowlistMissing)
	}
	if !req.Now.Before(req.Bundle.WindowEnd) {
		health.Stopped = true
		return health, finish(req, health, ErrWindowClosed)
	}
	if _, err := req.Protector.Protect([]byte("ready")); err != nil {
		return health, finish(req, health, err)
	}
	if err := gateway.Pair(ctx, req.Bundle.Cookies, func(emoji string) {
		if req.EmojiOut != nil && !strings.Contains(emoji, "cookie") {
			_, _ = io.WriteString(req.EmojiOut, emoji+"\n")
		}
	}); err != nil {
		health.LastFailure = "pair_failed"
		return health, finish(req, health, err)
	}
	material, err := gateway.SessionMaterial()
	if err != nil {
		gateway.Disconnect()
		return health, finish(req, health, err)
	}
	sealed, err := req.Protector.Protect(material)
	for i := range material {
		material[i] = 0
	}
	if err != nil {
		gateway.Disconnect()
		return health, finish(req, health, err)
	}
	if err := writeSession(req.SessionPath, req.Repo, sealed); err != nil {
		gateway.Disconnect()
		return health, finish(req, health, err)
	}
	health.GoogleSessionOpened = true
	health.Connected = true
	seen := map[string]struct{}{}
	for {
		if ctx.Err() != nil || stopRequested(req.ControlDir) || !time.Now().Before(req.Bundle.WindowEnd) {
			health.Stopped = true
			health.Connected = false
			gateway.Disconnect()
			health.LastFailure = "stopped"
			return health, finish(req, health, nil)
		}
		heads, err := gateway.List(ctx)
		if err != nil {
			if !resume(ctx, gateway, req, &health, err) {
				return health, finish(req, health, err)
			}
			continue
		}
		var stored []Record
		failed := false
		for _, head := range heads {
			if head.Preview != "" {
				health.FilteredPreviews++
			}
			if normalize(head.Phone) != normalize(req.Bundle.Contact) {
				continue
			}
			events, err := gateway.Fetch(ctx, head.ID)
			if err != nil {
				if !resume(ctx, gateway, req, &health, err) {
					return health, finish(req, health, err)
				}
				failed = true
				break
			}
			for _, event := range events {
				if event.Phone == "" {
					event.Phone = head.Phone
				}
				if event.GoogleMessageID == "" || normalize(event.Phone) != normalize(req.Bundle.Contact) {
					continue
				}
				if _, ok := seen[event.GoogleMessageID]; ok {
					continue
				}
				when := time.UnixMilli(event.TimestampMs)
				if when.Before(req.Bundle.WindowStart) || !when.Before(req.Bundle.WindowEnd) {
					continue
				}
				if event.Transport != "SMS" && event.Transport != "RCS" {
					continue
				}
				if event.Direction != "incoming" && event.Direction != "outgoing" {
					continue
				}
				var record Record
				if len(req.StagingKey) == 32 {
					record, err = EncryptStaging(req.StagingKey, req.Bundle.Contact, event, nil)
				} else {
					body, protectErr := req.Protector.Protect([]byte(event.Body))
					err = protectErr
					record = Record{
						GoogleMessageID: event.GoogleMessageID,
						ConversationID:  event.ConversationID,
						Transport:       event.Transport,
						Direction:       event.Direction,
						TimestampMs:     event.TimestampMs,
						ContactHash:     hashContact(req.Bundle.Contact),
						BodyCiphertext:  body,
					}
				}
				if err != nil {
					gateway.Disconnect()
					return health, finish(req, health, err)
				}
				seen[event.GoogleMessageID] = struct{}{}
				stored = append(stored, record)
			}
		}
		if failed {
			continue
		}
		if len(stored) > 0 && req.Sink != nil {
			if err := req.Sink(stored); err != nil {
				health.Connected = false
				health.LastFailure = "ingest_failed"
				gateway.Disconnect()
				return health, finish(req, health, err)
			}
		}
		health.Stored += len(stored)
		health.LastSuccess = time.Now().UTC().Format(time.RFC3339)
		health.Connected = true
		publish(req, health)
		waitForNext(ctx, req)
	}
}

func resume(ctx context.Context, gateway Gateway, req Request, health *Health, err error) bool {
	health.Connected = false
	if errors.Is(err, ErrCredentialsExpired) || !reconnectRequested(req.ControlDir) {
		if errors.Is(err, ErrCredentialsExpired) {
			health.LastFailure = "credentials_expired"
		} else {
			health.LastFailure = "disconnected"
		}
		health.Stopped = true
		gateway.Disconnect()
		return false
	}
	if err := gateway.Reconnect(ctx); err != nil {
		health.LastFailure = "disconnected"
		gateway.Disconnect()
		return false
	}
	health.Reconnects++
	health.Connected = true
	health.LastFailure = ""
	return true
}

func finish(req Request, health Health, err error) error {
	if writeErr := publish(req, health); writeErr != nil && err == nil {
		err = writeErr
	}
	return err
}

func publish(req Request, health Health) error {
	encoded, _ := json.Marshal(health)
	if bytes.Contains(encoded, []byte("cookie")) || bytes.Contains(encoded, []byte("SID")) {
		encoded = []byte(`{"ok":false}`)
	}
	if req.Log != nil {
		_, _ = req.Log.Write(append(encoded, '\n'))
	}
	if req.HealthPath == "" {
		return nil
	}
	return writeSession(req.HealthPath, req.Repo, encoded)
}

func waitForNext(ctx context.Context, req Request) {
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) && time.Now().Before(req.Bundle.WindowEnd) {
		if ctx.Err() != nil || stopRequested(req.ControlDir) {
			return
		}
		time.Sleep(200 * time.Millisecond)
	}
}

func allowMatches(allow []string, contact string) bool {
	want := normalize(contact)
	if want == "" || len(allow) != 1 {
		return false
	}
	return normalize(allow[0]) == want
}

func requiredCookies(cookies map[string]string) []string {
	var present []string
	for _, name := range pairui.RequiredCookies {
		if strings.TrimSpace(cookies[name]) != "" {
			present = append(present, name)
		}
	}
	return present
}

func normalize(value string) string {
	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, value)
	if len(digits) == 11 && digits[0] == '1' {
		return digits[1:]
	}
	if len(digits) == 10 {
		return digits
	}
	return ""
}

func hashContact(contact string) string {
	sum := sha256.Sum256([]byte(normalize(contact)))
	return hex.EncodeToString(sum[:])
}

func writeSession(path, repo string, sealed []byte) error {
	if err := preflight.SessionKeyAllowed(path, repo); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	return os.WriteFile(path, sealed, 0o600)
}

func stopRequested(dir string) bool {
	if dir == "" {
		return false
	}
	_, err := os.Stat(filepath.Join(dir, "stop"))
	return err == nil
}

func reconnectRequested(dir string) bool {
	if dir == "" {
		return false
	}
	path := filepath.Join(dir, "reconnect")
	if _, err := os.Stat(path); err != nil {
		return false
	}
	_ = os.Remove(path)
	return true
}
