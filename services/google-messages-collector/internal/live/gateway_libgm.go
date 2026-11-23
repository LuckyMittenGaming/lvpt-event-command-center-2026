//go:build livelibgm

package live

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/rs/zerolog"
	"go.mau.fi/mautrix-gmessages/pkg/libgm"
	"go.mau.fi/mautrix-gmessages/pkg/libgm/gmproto"
	"go.mau.fi/util/exhttp"
)

type libgmGateway struct {
	client *libgm.Client
}

func LiveGateway() (Gateway, error) {
	return &libgmGateway{}, nil
}

func (g *libgmGateway) Pair(ctx context.Context, cookies map[string]string, showEmoji func(string)) error {
	auth := libgm.NewAuthData()
	auth.SetCookies(cookies)
	g.client = libgm.NewClient(auth, nil, zerolog.Nop(), exhttp.ClientSettings{})
	emoji, session, err := g.client.StartGaiaPairing(ctx, ctx)
	if err != nil {
		return err
	}
	if showEmoji != nil {
		showEmoji(emoji)
	}
	_, err = g.client.FinishGaiaPairing(ctx, session)
	return err
}

func (g *libgmGateway) SessionMaterial() ([]byte, error) {
	if g.client == nil || g.client.AuthData == nil {
		return nil, ErrNotConfirmed
	}
	return json.Marshal(g.client.AuthData)
}

func (g *libgmGateway) List(ctx context.Context) ([]Head, error) {
	if g.client == nil {
		return nil, ErrDisconnected
	}
	response, err := g.client.ListConversations(ctx, &gmproto.ListConversationsRequest{})
	if err != nil {
		return nil, err
	}
	heads := make([]Head, 0, len(response.GetConversations()))
	for _, conversation := range response.GetConversations() {
		phone := ""
		for _, participant := range conversation.GetParticipants() {
			if !participant.GetIsMe() {
				phone = participant.GetFormattedNumber()
			}
		}
		preview := ""
		if latest := conversation.GetLatestMessage(); latest != nil {
			preview = latest.GetDisplayContent()
		}
		heads = append(heads, Head{
			ID:      conversation.GetConversationID(),
			Phone:   phone,
			Preview: preview,
		})
	}
	return heads, nil
}

func (g *libgmGateway) Fetch(ctx context.Context, conversationID string) ([]Event, error) {
	if g.client == nil {
		return nil, ErrDisconnected
	}
	var cursor *gmproto.Cursor
	events := make([]Event, 0, 50)
	for page := 0; page < 8; page++ {
		response, err := g.client.FetchMessages(ctx, conversationID, 50, cursor)
		if err != nil {
			return nil, err
		}
		events = append(events, mapMessages(response.GetMessages())...)
		next := response.GetCursor()
		if next == nil || next.GetLastItemID() == "" || len(response.GetMessages()) == 0 {
			break
		}
		if cursor != nil && next.GetLastItemID() == cursor.GetLastItemID() {
			break
		}
		cursor = next
	}
	return events, nil
}

func mapMessages(messages []*gmproto.Message) []Event {
	events := make([]Event, 0, len(messages))
	for _, message := range messages {
		transport := ""
		switch message.GetType() {
		case 1:
			transport = "SMS"
		case 4:
			transport = "RCS"
		default:
			continue
		}
		direction := "incoming"
		if strings.Contains(message.GetMessageStatus().GetStatus().String(), "OUTGOING") {
			direction = "outgoing"
		}
		timestamp := message.GetTimestamp()
		if timestamp > 1_000_000_000_000_000 {
			timestamp = timestamp / 1000
		}
		var body strings.Builder
		for _, info := range message.GetMessageInfo() {
			if content := info.GetMessageContent(); content != nil {
				body.WriteString(content.GetContent())
			}
		}
		events = append(events, Event{
			GoogleMessageID: message.GetMessageID(),
			ConversationID:  message.GetConversationID(),
			Transport:       transport,
			Direction:       direction,
			TimestampMs:     timestamp,
			Body:            body.String(),
		})
	}
	return events
}

func (g *libgmGateway) Disconnect() {
	if g.client != nil {
		g.client.Disconnect()
	}
}

func (g *libgmGateway) Reconnect(ctx context.Context) error {
	if g.client == nil {
		return ErrDisconnected
	}
	return g.client.Reconnect(ctx)
}
