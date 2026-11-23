//go:build livelibgm

package upstream

import (
	"context"
	"errors"

	"go.mau.fi/mautrix-gmessages/pkg/libgm"
	"go.mau.fi/mautrix-gmessages/pkg/libgm/gmproto"
)

// ErrLiveNotAuthorized refuses a real Google session until the owner gate.
var ErrLiveNotAuthorized = errors.New("owner authorization required before any Google session")

// ReadOnly lists conversations and fetches one conversation.
// Connect, MarkRead, and every send or delete method are intentionally not called.
// Calling ListConversations still lets Google deliver preview text for every conversation.
func ReadOnly(client *libgm.Client, ctx context.Context, conversationID string, ownerAuthorized bool) error {
	if !ownerAuthorized || client == nil {
		return ErrLiveNotAuthorized
	}
	if _, err := client.ListConversations(ctx, &gmproto.ListConversationsRequest{}); err != nil {
		return err
	}
	_, err := client.FetchMessages(ctx, conversationID, 50, nil)
	return err
}
