package collect

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"

	"lvpt.local/google-messages-collector/internal/session"
	"lvpt.local/google-messages-collector/internal/upstream"
)

type Conversation struct {
	ID        string
	Phone     string
	Preview   string
	Transport string
}

type Message struct {
	GoogleMessageID string
	ConversationID  string
	Transport       string
	Direction       string
	TimestampMs     int64
	Phone           string
	Body            string
	AttachmentIDs   []string
	ReplyTo         string
	ReactionTo      string
}

type Reader interface {
	List(context.Context) ([]Conversation, error)
	Fetch(context.Context, string) ([]Message, error)
}

type Record struct {
	ID              string `json:"id"`
	Provider        string `json:"provider"`
	Transport       string `json:"transport"`
	GoogleMessageID string `json:"googleMessageId"`
	ConversationID  string `json:"conversationId"`
	Direction       string `json:"direction"`
	TimestampMs     int64  `json:"timestampMs"`
	ContactHash     string `json:"contactHash"`
	BodyFingerprint string `json:"bodyFingerprint"`
	AttachmentCount int    `json:"attachmentCount"`
	ReplyTo         string `json:"replyTo,omitempty"`
	ReactionTo      string `json:"reactionTo,omitempty"`
	IngestedAt      string `json:"ingestedAt"`
	Source          string `json:"source"`
	Provenance      string `json:"provenance"`
	SyncStatus      string `json:"syncStatus"`
	BodyCiphertext  []byte `json:"-"`
}

type Link struct {
	Status string `json:"status"`
	Left   string `json:"left"`
	Right  string `json:"right"`
	Reason string `json:"reason"`
}

type Health struct {
	Pairing               string `json:"pairing"`
	Connected             bool   `json:"connected"`
	LastSuccess           string `json:"lastSuccess"`
	LastFailure           string `json:"lastFailure"`
	Reconnects            int    `json:"reconnects"`
	Stored                int    `json:"stored"`
	FilteredConversations int    `json:"filteredConversations"`
	SendCalls             int    `json:"sendCalls"`
	MarkReadCalls         int    `json:"markReadCalls"`
	ProtocolAck           string `json:"protocolAck"`
	PreviewLimitation     string `json:"previewLimitation"`
	LibGMCommit           string `json:"libgmCommit"`
}

type Collector struct {
	Reader  Reader
	Allow   map[string]bool
	Key     []byte
	BodyKey []byte
	Health  Health
	Records []Record
	Links   []Link
	seen    map[string]struct{}
	wasDown bool
}

func New(reader Reader, allow []string, sessionKey, bodyKey []byte) *Collector {
	set := map[string]bool{}
	for _, phone := range allow {
		set[NormalizePhone(phone)] = true
	}
	return &Collector{
		Reader:  reader,
		Allow:   set,
		Key:     sessionKey,
		BodyKey: bodyKey,
		seen:    map[string]struct{}{},
		Health: Health{
			Pairing:           "unpaired",
			ProtocolAck:       upstream.ProtocolAcknowledgement,
			PreviewLimitation: upstream.ListPreviewLimitation,
			LibGMCommit:       upstream.Commit,
		},
	}
}

func (c *Collector) Sync(ctx context.Context) error {
	list, err := c.Reader.List(ctx)
	if err != nil {
		c.Health.Connected = false
		c.Health.LastFailure = "list_failed"
		c.wasDown = true
		return err
	}
	if c.wasDown {
		c.Health.Reconnects++
		c.wasDown = false
	}
	c.Health.Connected = true
	c.Health.LastFailure = ""
	now := time.Now().UTC().Format(time.RFC3339Nano)
	c.Health.LastSuccess = now
	for _, conversation := range list {
		phone := NormalizePhone(conversation.Phone)
		if phone == "" || !c.Allow[phone] {
			c.Health.FilteredConversations++
			continue
		}
		messages, err := c.Reader.Fetch(ctx, conversation.ID)
		if err != nil {
			c.Health.Connected = false
			c.Health.LastFailure = "fetch_failed"
			c.wasDown = true
			return err
		}
		for _, message := range messages {
			if _, err := c.keep(message, now); err != nil {
				return err
			}
		}
	}
	c.Health.Stored = len(c.Records)
	return nil
}

func (c *Collector) keep(message Message, ingestedAt string) (bool, error) {
	id := "gm:" + strings.TrimSpace(message.GoogleMessageID)
	if message.GoogleMessageID == "" {
		return false, nil
	}
	if _, exists := c.seen[id]; exists {
		return false, nil
	}
	phone := NormalizePhone(message.Phone)
	if phone == "" || !c.Allow[phone] {
		return false, nil
	}
	direction := message.Direction
	if direction != "incoming" && direction != "outgoing" {
		return false, nil
	}
	transport := message.Transport
	if transport != "SMS" && transport != "RCS" {
		return false, nil
	}
	sealed, err := session.Seal(c.BodyKey, []byte(message.Body))
	if err != nil {
		return false, err
	}
	c.seen[id] = struct{}{}
	c.Records = append(c.Records, Record{
		ID:              id,
		Provider:        "Google Messages",
		Transport:       transport,
		GoogleMessageID: message.GoogleMessageID,
		ConversationID:  message.ConversationID,
		Direction:       direction,
		TimestampMs:     message.TimestampMs,
		ContactHash:     contactHash(c.Key, phone),
		BodyFingerprint: fingerprint(message.Body),
		AttachmentCount: len(message.AttachmentIDs),
		ReplyTo:         message.ReplyTo,
		ReactionTo:      message.ReactionTo,
		IngestedAt:      ingestedAt,
		Source:          "google-messages-collector",
		Provenance:      "synthetic",
		SyncStatus:      "synthetic_ok",
		BodyCiphertext:  sealed,
	})
	return true, nil
}

func (c *Collector) NotePossibleSMS(smsID string, phone, direction, body string, timestampMs int64) {
	phone = NormalizePhone(phone)
	if phone == "" || !c.Allow[phone] {
		return
	}
	fp := fingerprint(body)
	hash := contactHash(c.Key, phone)
	for _, record := range c.Records {
		if record.ContactHash == hash && record.Direction == direction && record.BodyFingerprint == fp && abs(record.TimestampMs-timestampMs) <= 5000 {
			c.Links = append(c.Links, Link{
				Status: "possible_duplicate",
				Left:   smsID,
				Right:  record.ID,
				Reason: "contact_direction_fingerprint_timestamp",
			})
		}
	}
}

func NormalizePhone(value string) string {
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

func contactHash(key []byte, phone string) string {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(phone))
	return hex.EncodeToString(mac.Sum(nil))
}

func fingerprint(body string) string {
	sum := sha256.Sum256([]byte(body))
	return hex.EncodeToString(sum[:])
}

func abs(value int64) int64 {
	if value < 0 {
		return -value
	}
	return value
}
