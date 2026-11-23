package live

import (
	"bytes"
	"encoding/base64"
	"testing"
)

func TestEncryptionMatchesStagingContract(t *testing.T) {
	key := bytes.Repeat([]byte{7}, 32)
	nonce := bytes.Repeat([]byte{4}, 12)
	record, err := EncryptStaging(key, "15550100199", Event{
		GoogleMessageID: "gm-test-phase11",
		ConversationID:  "test-conversation",
		Transport:       "RCS",
		Direction:       "incoming",
		TimestampMs:     1763800000000,
		Body:            "TEST",
	}, nonce)
	if err != nil {
		t.Fatal(err)
	}
	if record.ContactHash != "bf54542dc7d6c255cdf848d286c100023f986f9ecfaee3208179b52a14746608" {
		t.Fatal(record.ContactHash)
	}
	if base64.StdEncoding.EncodeToString(record.BodyNonce) != "BAQEBAQEBAQEBAQE" {
		t.Fatal(base64.StdEncoding.EncodeToString(record.BodyNonce))
	}
	if base64.StdEncoding.EncodeToString(record.BodyCiphertext) != "AXZ7nDarwZA52LelJpkfMeAaXQE=" {
		t.Fatal(base64.StdEncoding.EncodeToString(record.BodyCiphertext))
	}
	if record.Source != "google-messages" || record.SchemaVersion != 1 {
		t.Fatalf("%+v", record)
	}
}
