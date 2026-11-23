package session

import (
	"bytes"
	"testing"
)

func TestSealHidesSessionMaterial(t *testing.T) {
	key := bytes.Repeat([]byte{7}, 32)
	secret := []byte("google-session-cookie-marker-not-for-logs")
	sealed, err := Seal(key, secret)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(sealed, secret) {
		t.Fatal("sealed session still contains the cookie marker")
	}
	opened, err := Open(key, sealed)
	if err != nil || !bytes.Equal(opened, secret) {
		t.Fatalf("open failed: %v", err)
	}
	wrong := bytes.Repeat([]byte{8}, 32)
	if _, err := Open(wrong, sealed); err == nil {
		t.Fatal("wrong key opened the session")
	}
}
