package preflight

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

func FindRepo(start string) (string, error) {
	dir, err := filepath.Abs(start)
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, ".git")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", errors.New("repository root not found")
		}
		dir = parent
	}
}

func SessionKeyAllowed(keyPath, repoRoot string) error {
	if strings.TrimSpace(keyPath) == "" {
		return errors.New("missing session key path")
	}
	absKey, err := filepath.Abs(keyPath)
	if err != nil {
		return err
	}
	absRepo, err := filepath.Abs(repoRoot)
	if err != nil {
		return err
	}
	rel, err := filepath.Rel(absRepo, absKey)
	if err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return errors.New("session key is inside the repository")
	}
	return nil
}
