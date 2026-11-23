package preflight

import (
	"path/filepath"
	"testing"
)

func TestSessionKeyStaysOutsideTheRepository(t *testing.T) {
	repo := t.TempDir()
	inside := filepath.Join(repo, "services", "session.key")
	if err := SessionKeyAllowed(inside, repo); err == nil {
		t.Fatal("accepted a key inside the repository")
	}
	outside := filepath.Join(t.TempDir(), "session.key")
	if err := SessionKeyAllowed(outside, repo); err != nil {
		t.Fatal(err)
	}
	if err := SessionKeyAllowed("  ", repo); err == nil {
		t.Fatal("accepted an empty key path")
	}
}
