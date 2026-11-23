//go:build livelibgm

package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"lvpt.local/google-messages-collector/internal/live"
	"lvpt.local/google-messages-collector/internal/pairui"
	"lvpt.local/google-messages-collector/internal/preflight"
)

func runLiveTest() error {
	if os.Getenv("LVPT_RCS_OWNER_CONFIRM") != "yes" {
		return errors.New("owner confirmation missing; no Google session was opened")
	}
	endpoint := os.Getenv("LVPT_RCS_STAGING_URL")
	token := os.Getenv("LVPT_RCS_STAGING_TOKEN")
	if err := live.ValidateStagingURL(endpoint); err != nil {
		return err
	}
	if err := live.PostStaging(context.Background(), endpoint, token, nil); err != nil {
		return errors.New("staging ingest is not ready; no Google session was opened")
	}
	repo, sealPath, err := localSeal()
	if err != nil {
		return err
	}
	protector, err := pairui.NewOSProtector()
	if err != nil {
		return err
	}
	sealed, err := os.ReadFile(sealPath)
	if err != nil {
		return errors.New("sealed pairing bundle is missing")
	}
	plain, err := protector.Unprotect(sealed)
	if err != nil {
		return errors.New("sealed pairing bundle could not be opened")
	}
	var decoded struct {
		Authorization pairui.Authorization
		Cookies       map[string]string
	}
	if err := json.Unmarshal(plain, &decoded); err != nil {
		return errors.New("sealed pairing bundle could not be read")
	}
	for i := range plain {
		plain[i] = 0
	}
	allowPath := os.Getenv("LVPT_RCS_ALLOWLIST")
	if allowPath == "" {
		allowPath = filepath.Join(filepath.Dir(sealPath), "allowlist.txt")
	}
	if err := preflight.SessionKeyAllowed(allowPath, repo); err != nil {
		return err
	}
	allowRaw, err := os.ReadFile(allowPath)
	if err != nil {
		return errors.New("contact allowlist is missing")
	}
	allow := strings.Fields(string(allowRaw))
	if len(allow) != 1 {
		return errors.New("contact allowlist must contain one contact")
	}
	dir, err := controlDir()
	if err != nil {
		return err
	}
	gateway, err := live.LiveGateway()
	if err != nil {
		return err
	}
	_, err = live.Run(context.Background(), gateway, live.Request{
		OwnerConfirm: true,
		Bundle: live.Bundle{
			Approved:      decoded.Authorization.Approved,
			GoogleAccount: decoded.Authorization.GoogleAccount,
			Contact:       decoded.Authorization.Contact,
			WindowStart:   decoded.Authorization.WindowStart,
			WindowEnd:     decoded.Authorization.WindowEnd,
			Cookies:       decoded.Cookies,
		},
		Allow:       allow,
		Now:         time.Now(),
		Log:         os.Stderr,
		EmojiOut:    os.Stdout,
		Protector:   protector,
		SessionPath: filepath.Join(dir, "paired.sealed"),
		Repo:        repo,
		ControlDir:  dir,
		HealthPath:  filepath.Join(dir, "health.json"),
		Sink: func(records []live.Record) error {
			return live.PostStaging(context.Background(), endpoint, token, records)
		},
	})
	return err
}
