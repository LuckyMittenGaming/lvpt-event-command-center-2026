package live

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
	"strconv"
	"strings"
)

func StagingKeyFromBase64(raw string) ([]byte, error) {
	key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(raw))
	if err != nil || len(key) != 32 {
		return nil, errors.New("staging encryption key is missing")
	}
	return key, nil
}

func EncryptStaging(key []byte, contact string, event Event, nonce []byte) (Record, error) {
	if len(key) != 32 {
		return Record{}, errors.New("staging encryption key is missing")
	}
	local := normalize(contact)
	if local == "" || event.GoogleMessageID == "" || (event.Transport != "SMS" && event.Transport != "RCS") {
		return Record{}, errors.New("staging record is not eligible")
	}
	if len(nonce) == 0 {
		nonce = make([]byte, 12)
		if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
			return Record{}, err
		}
	}
	if len(nonce) != 12 {
		return Record{}, errors.New("staging nonce is invalid")
	}
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(local))
	hash := mac.Sum(nil)
	contactHash := hexEncode(hash)
	source := "google-messages"
	record := Record{
		GoogleMessageID: event.GoogleMessageID,
		ConversationID:  event.ConversationID,
		Transport:       event.Transport,
		Direction:       event.Direction,
		TimestampMs:     event.TimestampMs,
		ContactHash:     contactHash,
		SchemaVersion:   1,
		Source:          source,
		BodyNonce:       append([]byte(nil), nonce...),
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return Record{}, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return Record{}, err
	}
	record.BodyCiphertext = gcm.Seal(nil, nonce, []byte(event.Body), aad(record))
	return record, nil
}

func aad(record Record) []byte {
	parts := []string{
		"lvpt-rcs-v1",
		"lvpt-owner-pilot",
		record.GoogleMessageID,
		record.Source,
		record.ContactHash,
		record.Transport,
		record.Direction,
		strconv.FormatInt(record.TimestampMs, 10),
		strconv.Itoa(record.SchemaVersion),
	}
	return []byte(strings.Join(parts, "|"))
}

func hexEncode(value []byte) string {
	const digits = "0123456789abcdef"
	out := make([]byte, len(value)*2)
	for i, b := range value {
		out[i*2] = digits[b>>4]
		out[i*2+1] = digits[b&0x0f]
	}
	return string(out)
}
