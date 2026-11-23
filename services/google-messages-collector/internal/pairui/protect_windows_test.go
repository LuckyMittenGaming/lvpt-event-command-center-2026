//go:build windows

package pairui

import (
	"bytes"
	"testing"
)

func TestWindowsProtectsSyntheticMaterial(t *testing.T) {
	protector, err := NewOSProtector()
	if err != nil {
		t.Fatal(err)
	}
	marker := []byte("synthetic-os-marker")
	sealed, err := protector.Protect(marker)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(sealed, marker) {
		t.Fatal("DPAPI output contained the plaintext marker")
	}
	opened, err := protector.Unprotect(sealed)
	if err != nil || !bytes.Equal(opened, marker) {
		t.Fatal("DPAPI could not round-trip synthetic material")
	}
}
