package live

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"lvpt.local/google-messages-collector/internal/pairui"
)

const cookieMarker = "synthetic-cookie-marker"
const previewMarker = "UNAPPROVED-PREVIEW-TEXT"

type scripted struct {
	paired     int
	fetches    int
	reconnects int
	failFetch  int
	expire     bool
	events     []Event
}

func (s *scripted) Pair(_ context.Context, cookies map[string]string, show func(string)) error {
	s.paired++
	if cookies["SID"] == "" {
		return ErrNotConfirmed
	}
	show("SYNTHETIC-EMOJI")
	return nil
}

func (s *scripted) SessionMaterial() ([]byte, error) {
	return []byte("paired-synthetic-session"), nil
}

func (s *scripted) List(context.Context) ([]Head, error) {
	return []Head{
		{ID: "conv-approved", Phone: "2025550148", Preview: "approved synthetic"},
		{ID: "conv-other", Phone: "2025550199", Preview: previewMarker},
	}, nil
}

func (s *scripted) Fetch(_ context.Context, id string) ([]Event, error) {
	s.fetches++
	if id != "conv-approved" {
		tFail := previewMarker
		return []Event{{GoogleMessageID: "should-not", ConversationID: id, Transport: "RCS", Direction: "incoming", Phone: "2025550199", Body: tFail, TimestampMs: time.Now().UnixMilli()}}, nil
	}
	if s.expire {
		return nil, ErrCredentialsExpired
	}
	if s.failFetch > 0 {
		s.failFetch--
		return nil, ErrDisconnected
	}
	return s.events, nil
}

func (s *scripted) Disconnect() {}

func (s *scripted) Reconnect(context.Context) error {
	s.reconnects++
	return nil
}

func TestLiveRunFailsClosedAndCollectsBoundedRCS(t *testing.T) {
	now := time.Now()
	windowStart := now.Add(-time.Minute)
	windowEnd := now.Add(time.Hour)
	inside := now.UnixMilli()
	gateway := &scripted{events: []Event{
		{GoogleMessageID: "gm-in", ConversationID: "conv-approved", Transport: "RCS", Direction: "incoming", TimestampMs: inside, Body: "synthetic incoming rcs"},
		{GoogleMessageID: "gm-in", ConversationID: "conv-approved", Transport: "RCS", Direction: "incoming", TimestampMs: inside, Body: "synthetic incoming rcs"},
		{GoogleMessageID: "gm-out", ConversationID: "conv-approved", Transport: "RCS", Direction: "outgoing", TimestampMs: inside, Body: "synthetic outgoing rcs"},
		{GoogleMessageID: "gm-old", ConversationID: "conv-approved", Transport: "RCS", Direction: "incoming", TimestampMs: now.Add(-2 * time.Hour).UnixMilli(), Body: "outside window"},
	}}
	var logs bytes.Buffer
	var emoji bytes.Buffer
	var stored []Record
	repo := t.TempDir()
	control := t.TempDir()
	sessionPath := filepath.Join(t.TempDir(), "paired.sealed")
	health, err := Run(context.Background(), gateway, request(t, true, windowStart, windowEnd, sessionPath, repo, control, &logs, &emoji, func(records []Record) error {
		stored = append(stored, records...)
		return os.WriteFile(filepath.Join(control, "stop"), []byte("1"), 0o600)
	}))
	if err != nil {
		t.Fatal(err)
	}
	if gateway.paired != 1 || gateway.fetches != 1 {
		t.Fatalf("pair %d fetch %d", gateway.paired, gateway.fetches)
	}
	if len(stored) != 2 || stored[0].GoogleMessageID != "gm-in" || stored[1].Direction != "outgoing" {
		t.Fatalf("stored %+v", stored)
	}
	if health.Stored != 2 || health.FilteredPreviews != 2 || health.SendCalls != 0 || health.MarkReadCalls != 0 || !health.GoogleSessionOpened {
		t.Fatalf("health %+v", health)
	}
	raw, _ := os.ReadFile(sessionPath)
	text := logs.String() + emoji.String() + string(raw)
	for _, forbidden := range []string{cookieMarker, previewMarker, "synthetic incoming", "2025550148"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("output contained %s", forbidden)
		}
	}
	if !strings.Contains(emoji.String(), "SYNTHETIC-EMOJI") {
		t.Fatal("emoji challenge was not displayed")
	}

	closed, _ := Run(context.Background(), &scripted{}, request(t, false, windowStart, windowEnd, sessionPath, repo, "", ioDiscard(), ioDiscard(), nil))
	if closed.GoogleSessionOpened {
		t.Fatal("missing confirmation opened a session")
	}
}

func TestDisconnectReconnectExpiryAndStop(t *testing.T) {
	now := time.Now()
	start := now.Add(-time.Minute)
	end := now.Add(time.Hour)
	repo := t.TempDir()
	control := t.TempDir()
	if err := os.WriteFile(filepath.Join(control, "reconnect"), []byte("1"), 0o600); err != nil {
		t.Fatal(err)
	}
	gateway := &scripted{failFetch: 1, events: []Event{{
		GoogleMessageID: "gm-after", ConversationID: "conv-approved", Transport: "RCS", Direction: "incoming", TimestampMs: now.UnixMilli(), Body: "after reconnect",
	}}}
	var stored []Record
	health, err := Run(context.Background(), gateway, request(t, true, start, end, filepath.Join(t.TempDir(), "paired.sealed"), repo, control, ioDiscard(), ioDiscard(), func(records []Record) error {
		stored = append(stored, records...)
		return os.WriteFile(filepath.Join(control, "stop"), []byte("1"), 0o600)
	}))
	if err != nil || gateway.reconnects != 1 || health.Reconnects != 1 || len(stored) != 1 {
		t.Fatalf("reconnect health %+v err %v stored %d reconnects %d", health, err, len(stored), gateway.reconnects)
	}

	expiredGateway := &scripted{expire: true}
	expiredHealth, err := Run(context.Background(), expiredGateway, request(t, true, start, end, filepath.Join(t.TempDir(), "paired.sealed"), repo, t.TempDir(), ioDiscard(), ioDiscard(), func([]Record) error {
		t.Fatal("expired credentials were ingested")
		return nil
	}))
	if err != ErrCredentialsExpired || expiredHealth.Stored != 0 || !expiredHealth.Stopped {
		t.Fatalf("expired %+v %v", expiredHealth, err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	base := &scripted{}
	stopped, err := Run(ctx, cancelAfterPair{scripted: base, cancel: cancel}, request(t, true, start, end, filepath.Join(t.TempDir(), "paired.sealed"), repo, t.TempDir(), ioDiscard(), ioDiscard(), func([]Record) error {
		t.Fatal("interrupted run ingested")
		return nil
	}))
	if err != nil || !stopped.Stopped || base.fetches != 0 {
		t.Fatalf("interrupt %+v fetches %d err %v", stopped, base.fetches, err)
	}
}

type cancelAfterPair struct {
	*scripted
	cancel context.CancelFunc
}

func (c cancelAfterPair) Pair(ctx context.Context, cookies map[string]string, show func(string)) error {
	if err := c.scripted.Pair(ctx, cookies, show); err != nil {
		return err
	}
	c.cancel()
	return nil
}

func TestStagingPostRejectsProductionAndKeepsBodiesOut(t *testing.T) {
	if err := ValidateStagingURL("https://lvpt-event-command-center-2026.vercel.app/api/sms/staging/rcs-ingest"); err != ErrProductionStaging {
		t.Fatal(err)
	}
	var body []byte
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Header.Get("x-lvpt-sms-sync-token") != "" || r.Header.Get("x-lvpt-rcs-sync-token") == "" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if calls == 1 {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		body, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	endpoint := server.URL + "/api/sms/staging/rcs-ingest"
	err := PostStaging(context.Background(), endpoint, strings.Repeat("t", 32), []Record{{
		GoogleMessageID: "gm-1", ConversationID: "conv", Transport: "RCS", Direction: "incoming",
		TimestampMs: time.Now().UnixMilli(), ContactHash: strings.Repeat("ab", 32),
		SchemaVersion: 1, Source: "synthetic-test", BodyNonce: []byte("0123456789ab"),
		BodyCiphertext: []byte("sealed-body"),
	}})
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 || !bytes.Contains(body, []byte("gm-1")) || !bytes.Contains(body, []byte("synthetic-test")) || bytes.Contains(body, []byte(cookieMarker)) || bytes.Contains(body, []byte("x-lvpt-sms-sync-token")) {
		t.Fatalf("calls %d staging payload = %s", calls, body)
	}
}

func request(t *testing.T, confirm bool, start, end time.Time, sessionPath, repo, control string, log, emoji ioWriter, sink func([]Record) error) Request {
	t.Helper()
	return Request{
		OwnerConfirm: confirm,
		Bundle: Bundle{
			Approved: true, GoogleAccount: "owner@example.com", Contact: "2025550148",
			WindowStart: start, WindowEnd: end,
			Cookies: map[string]string{"SID": cookieMarker, "HSID": "h", "SSID": "s", "APISID": "a", "SAPISID": "sa", "OSID": "o"},
		},
		Allow: []string{"2025550148"}, Now: time.Now(), Log: log, EmojiOut: emoji,
		Protector:   pairui.NewKeyedProtector(bytes.Repeat([]byte{5}, 32)),
		SessionPath: sessionPath, Repo: repo, ControlDir: control, Sink: sink,
	}
}

type ioWriter interface {
	Write([]byte) (int, error)
}

func ioDiscard() ioWriter { return bytes.NewBuffer(nil) }
