package upstream

// Reviewed pin of go.mau.fi/mautrix-gmessages pkg/libgm.
// QR login was removed upstream. This collector does not pair an account.
const (
	Module   = "go.mau.fi/mautrix-gmessages"
	Commit   = "ed5dc19eb2b4149ee242cf000c86a7150dca9947"
	Version  = "v0.2611.1-0.20261119194137-ed5dc19eb2b4"
	Reviewed = "2026-11-19"
	// ProtocolAcknowledgement describes the automatic RPC ack inside
	// SessionHandler.queueMessageAck. It keeps Google's event stream moving.
	// It is not Client.MarkRead and it does not send a read receipt.
	ProtocolAcknowledgement = "libgm queues an RPC ack for every incoming long-poll response so delivery does not stall. That ack is not MarkRead. This collector does not connect, so it sends neither."
	// ListPreviewLimitation is a provider behavior, not a collector choice.
	// Conversation.latestMessage.displayContent arrives before FetchMessages.
	ListPreviewLimitation = "Google returns a latest-message preview for every conversation in the list response. Non-approved previews are discarded before FetchMessages and are not logged. The paired session still received them."
)
