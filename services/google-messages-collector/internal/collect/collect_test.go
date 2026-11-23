package collect

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"lvpt.local/google-messages-collector/internal/session"
)

type scripted struct {
	failList int
	fetched  []string
	listed   int
}

func (s *scripted) List(context.Context) ([]Conversation, error) {
	s.listed++
	if s.failList > 0 {
		s.failList--
		return nil, errors.New("disconnected")
	}
	return []Conversation{
		{ID: "conv-approved", Phone: "+1 (702) 555-0199", Preview: "approved synthetic", Transport: "RCS"},
		{ID: "conv-other", Phone: "7025550101", Preview: "UNAPPROVED PREVIEW TEXT", Transport: "SMS"},
	}, nil
}

func (s *scripted) Fetch(_ context.Context, id string) ([]Message, error) {
	s.fetched = append(s.fetched, id)
	if id != "conv-approved" {
		return []Message{{
			GoogleMessageID: "should-not-store",
			ConversationID:  id,
			Transport:       "SMS",
			Direction:       "incoming",
			TimestampMs:     50,
			Phone:           "7025550101",
			Body:            "UNAPPROVED PREVIEW TEXT",
		}}, nil
	}
	return []Message{
		{GoogleMessageID: "gm-in-sms", ConversationID: id, Transport: "SMS", Direction: "incoming", TimestampMs: 1_700_000_000_000, Phone: "17025550199", Body: "Synthetic rehearsal incoming", AttachmentIDs: []string{"att-1"}},
		{GoogleMessageID: "gm-out-rcs", ConversationID: id, Transport: "RCS", Direction: "outgoing", TimestampMs: 1_700_000_010_000, Phone: "7025550199", Body: "Synthetic rehearsal outgoing", ReplyTo: "gm-in-sms"},
		{GoogleMessageID: "gm-react", ConversationID: id, Transport: "RCS", Direction: "incoming", TimestampMs: 1_700_000_020_000, Phone: "7025550199", Body: "", ReactionTo: "gm-out-rcs"},
	}, nil
}

func TestSyntheticCollection(t *testing.T) {
	reader := &scripted{failList: 1}
	key := bytes.Repeat([]byte{9}, 32)
	bodyKey := bytes.Repeat([]byte{4}, 32)
	collector := New(reader, []string{"7025550199"}, key, bodyKey)

	if err := collector.Sync(context.Background()); err == nil {
		t.Fatal("expected the first sync to report disconnection")
	}
	if collector.Health.Connected || collector.Health.LastFailure != "list_failed" {
		t.Fatalf("health after failure: %+v", collector.Health)
	}
	if err := collector.Sync(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := collector.Sync(context.Background()); err != nil {
		t.Fatal(err)
	}
	if collector.Health.Reconnects != 1 || !collector.Health.Connected || collector.Health.LastSuccess == "" {
		t.Fatalf("reconnect health: %+v", collector.Health)
	}
	if len(collector.Records) != 3 {
		t.Fatalf("reimport stored %d records", len(collector.Records))
	}
	if strings.Join(reader.fetched, ",") != "conv-approved,conv-approved" {
		t.Fatalf("fetched non-approved conversation: %v", reader.fetched)
	}
	if collector.Health.FilteredConversations != 2 {
		t.Fatalf("filtered count: %d", collector.Health.FilteredConversations)
	}
	if collector.Health.SendCalls != 0 || collector.Health.MarkReadCalls != 0 {
		t.Fatal("mutating calls were counted")
	}
	raw, _ := json.Marshal(collector.Health)
	raw = append(raw, mustJSON(collector.Records)...)
	text := string(raw)
	for _, forbidden := range []string{"UNAPPROVED", "Synthetic", "702555", "google-session"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("status leaked %s", forbidden)
		}
	}
	opened, err := session.Open(bodyKey, collector.Records[0].BodyCiphertext)
	if err != nil || string(opened) != "Synthetic rehearsal incoming" {
		t.Fatal("authorized body could not be opened with the data key")
	}
	if _, err := session.Open(key, collector.Records[0].BodyCiphertext); err == nil {
		t.Fatal("session key opened a message body")
	}
	transports := map[string]bool{}
	for _, record := range collector.Records {
		transports[record.Transport] = true
		if record.Provider != "Google Messages" || record.SyncStatus != "synthetic_ok" {
			t.Fatalf("record identity: %+v", record)
		}
	}
	if !transports["SMS"] || !transports["RCS"] {
		t.Fatal("SMS and RCS were not both preserved")
	}
	if collector.Records[1].ReplyTo != "gm-in-sms" || collector.Records[2].ReactionTo != "gm-out-rcs" {
		t.Fatal("reply or reaction relationship was dropped")
	}
	collector.NotePossibleSMS("sms:device-a:41", "7025550199", "incoming", "Synthetic rehearsal incoming", 1_700_000_002_000)
	if len(collector.Links) != 1 || collector.Links[0].Status != "possible_duplicate" || len(collector.Records) != 3 {
		t.Fatalf("possible link changed stored records: %+v", collector.Links)
	}
}

func TestSourceDoesNotCallMutatorsOrTouchOtherSystems(t *testing.T) {
	root := filepath.Join("..", "..")
	var sources []string
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		text, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		sources = append(sources, string(text))
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(sources, "\n")
	for _, forbidden := range []string{"SendMessage(", "MarkRead(", "SendReaction(", "DeleteMessage(", "DeleteConversation(", "SetTyping(", "TaskSync", "GmailApp", "lvpt_sms_staging"} {
		if strings.Contains(joined, forbidden) {
			t.Fatalf("collector source contains %s", forbidden)
		}
	}
}

func mustJSON(value any) []byte {
	raw, _ := json.Marshal(value)
	return raw
}
