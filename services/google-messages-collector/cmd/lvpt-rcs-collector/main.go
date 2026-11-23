package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"runtime"
	"strings"

	"path/filepath"

	"lvpt.local/google-messages-collector/internal/collect"
	"lvpt.local/google-messages-collector/internal/live"
	"lvpt.local/google-messages-collector/internal/pairui"
	"lvpt.local/google-messages-collector/internal/preflight"
	"lvpt.local/google-messages-collector/internal/upstream"
)

func main() {
	synthetic := flag.Bool("synthetic", false, "run the offline synthetic rehearsal and exit")
	check := flag.Bool("preflight", false, "check the local Windows staging path and exit")
	pair := flag.Bool("pair", false, "start the localhost pairing helper without contacting Google")
	revoke := flag.Bool("revoke", false, "delete the local sealed pairing bundle")
	liveTest := flag.Bool("live-test", false, "start an authorized read-only collection; requires the livelibgm build")
	health := flag.Bool("health", false, "print local collection health without contacting Google")
	stop := flag.Bool("stop", false, "ask the local collector to stop")
	reconnect := flag.Bool("reconnect", false, "ask the local collector to reconnect")
	checkAllow := flag.Bool("check-allowlist", false, "compare one local contact with the staging allowlist and do not contact Google")
	flag.Parse()
	if *checkAllow {
		if err := runAllowlistCheck(); err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			os.Exit(2)
		}
		fmt.Println("allowlist matches; no Google session was opened")
		return
	}
	if *stop {
		if err := writeControl("stop"); err != nil {
			fmt.Fprintln(os.Stderr, "stop failed")
			os.Exit(1)
		}
		fmt.Println("stop requested")
		return
	}
	if *reconnect {
		if err := writeControl("reconnect"); err != nil {
			fmt.Fprintln(os.Stderr, "reconnect failed")
			os.Exit(1)
		}
		fmt.Println("reconnect requested")
		return
	}
	if *health {
		if err := printHealth(); err != nil {
			fmt.Fprintln(os.Stderr, "health unavailable")
			os.Exit(1)
		}
		return
	}
	if *revoke {
		if err := runRevoke(); err != nil {
			fmt.Fprintln(os.Stderr, "revoke failed")
			os.Exit(1)
		}
		fmt.Println("revoked")
		return
	}
	if *pair {
		if err := runPair(); err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			os.Exit(1)
		}
		return
	}
	if *check {
		if err := runPreflight(); err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			os.Exit(1)
		}
		return
	}
	if *liveTest {
		if err := runLiveTest(); err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			os.Exit(2)
		}
		return
	}
	if !*synthetic {
		fmt.Fprintln(os.Stderr, "pairing is not authorized; no Google session was opened")
		os.Exit(2)
	}
	reader := &rehearsal{}
	collector := collect.New(reader, []string{"7025550199"}, repeat(9), repeat(4))
	if err := collector.Sync(context.Background()); err != nil {
		fmt.Fprintln(os.Stderr, "synthetic sync failed")
		os.Exit(1)
	}
	if err := collector.Sync(context.Background()); err != nil || len(collector.Records) != 2 {
		fmt.Fprintln(os.Stderr, "synthetic reimport failed")
		os.Exit(1)
	}
	report := map[string]any{
		"ok": true, "pairing": collector.Health.Pairing, "stored": collector.Health.Stored,
		"sendCalls": collector.Health.SendCalls, "markReadCalls": collector.Health.MarkReadCalls,
		"libgmCommit": upstream.Commit, "mode": "synthetic",
	}
	encoded, _ := json.Marshal(report)
	fmt.Println(string(encoded))
}

func runPreflight() error {
	wd, err := os.Getwd()
	if err != nil {
		return err
	}
	repo, err := preflight.FindRepo(wd)
	if err != nil {
		return err
	}
	keyPath := os.Getenv("LVPT_RCS_SESSION_KEY_FILE")
	keyReady := false
	if keyPath != "" {
		if err := preflight.SessionKeyAllowed(keyPath, repo); err != nil {
			return err
		}
		keyReady = true
	}
	report := map[string]any{
		"ok": true, "mode": "preflight", "goos": runtime.GOOS, "pairing": "unpaired",
		"libgmCommit": upstream.Commit, "libgmVersion": upstream.Version,
		"sessionKeyOutsideRepo": keyReady, "googleSessionOpened": false,
	}
	encoded, _ := json.Marshal(report)
	fmt.Println(string(encoded))
	return nil
}

func writeControl(name string) error {
	dir, err := controlDir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, name), []byte("1"), 0o600)
}

func printHealth() error {
	dir, err := controlDir()
	if err != nil {
		return err
	}
	raw, err := os.ReadFile(filepath.Join(dir, "health.json"))
	if err != nil {
		fmt.Println(`{"connected":false,"googleSessionOpened":false,"sendCalls":0,"markReadCalls":0}`)
		return nil
	}
	if bytesContain(raw, []byte("SID")) || bytesContain(raw, []byte("cookie")) {
		return errors.New("health file is not safe to print")
	}
	fmt.Println(string(raw))
	return nil
}

func controlDir() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	repo, err := preflight.FindRepo(wd)
	if err != nil {
		return "", err
	}
	dir := os.Getenv("LVPT_RCS_CONTROL_DIR")
	if dir == "" {
		base := os.Getenv("LOCALAPPDATA")
		if base == "" {
			return "", errors.New("LOCALAPPDATA is not set")
		}
		dir = filepath.Join(base, "LVPT", "rcs")
	}
	if err := preflight.SessionKeyAllowed(dir, repo); err != nil {
		return "", err
	}
	return dir, nil
}

func bytesContain(haystack, needle []byte) bool {
	return len(needle) > 0 && len(haystack) >= len(needle) && bytesIndex(haystack, needle) >= 0
}

func bytesIndex(haystack, needle []byte) int {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		match := true
		for j := range needle {
			if haystack[i+j] != needle[j] {
				match = false
				break
			}
		}
		if match {
			return i
		}
	}
	return -1
}

func runAllowlistCheck() error {
	endpoint := os.Getenv("LVPT_RCS_STAGING_URL")
	token := os.Getenv("LVPT_RCS_STAGING_TOKEN")
	key, err := live.StagingKeyFromBase64(os.Getenv("LVPT_RCS_STAGING_DATA_KEY_BASE64"))
	if err != nil {
		return errors.New("staging encryption key is missing; no Google session was opened")
	}
	dir, err := controlDir()
	if err != nil {
		return err
	}
	path := os.Getenv("LVPT_RCS_ALLOWLIST")
	if path == "" {
		path = filepath.Join(dir, "allowlist.txt")
	}
	fileContact := ""
	if raw, readErr := os.ReadFile(path); readErr == nil {
		fields := strings.Fields(string(raw))
		if len(fields) > 1 {
			return errors.New("contact allowlist must contain one contact")
		}
		if len(fields) == 1 {
			fileContact = fields[0]
		}
	}
	contact, err := live.ResolveContact(os.Getenv("LVPT_RCS_CONTACT"), fileContact)
	if err != nil {
		return err
	}
	hash, err := live.HashContact(key, contact)
	if err != nil {
		return err
	}
	if err := live.ConfirmAllowlist(context.Background(), endpoint, token, hash); err != nil {
		return errors.New(err.Error() + "; no Google session was opened")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(contact+"\n"), 0o600)
}

func runPair() error {
	repo, path, err := localSeal()
	if err != nil {
		return err
	}
	protector, err := pairui.NewOSProtector()
	if err != nil {
		return err
	}
	server, err := pairui.New(protector, path, repo, os.Stderr)
	if err != nil {
		return err
	}
	localURL, err := server.Start()
	if err != nil {
		return err
	}
	fmt.Println(localURL)
	fmt.Fprintln(os.Stderr, "local pairing helper is waiting; no Google session was opened")
	server.Wait()
	return nil
}

func runRevoke() error {
	repo, path, err := localSeal()
	if err != nil {
		return err
	}
	return pairui.RevokeFile(path, repo)
}

func localSeal() (string, string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", "", err
	}
	repo, err := preflight.FindRepo(wd)
	if err != nil {
		return "", "", err
	}
	path := os.Getenv("LVPT_RCS_SEALED_SESSION")
	if path == "" {
		base := os.Getenv("LOCALAPPDATA")
		if base == "" {
			return "", "", errors.New("LOCALAPPDATA is not set")
		}
		path = filepath.Join(base, "LVPT", "rcs", "session.sealed")
	}
	if err := preflight.SessionKeyAllowed(path, repo); err != nil {
		return "", "", err
	}
	return repo, path, nil
}

func repeat(value byte) []byte {
	return []byte{value, value, value, value, value, value, value, value, value, value, value, value, value, value, value, value, value, value, value, value, value, value, value, value, value, value, value, value, value, value, value, value}
}

type rehearsal struct{}

func (rehearsal) List(context.Context) ([]collect.Conversation, error) {
	return []collect.Conversation{{ID: "conv-synthetic", Phone: "7025550199", Transport: "RCS"}}, nil
}

func (rehearsal) Fetch(context.Context, string) ([]collect.Message, error) {
	return []collect.Message{
		{GoogleMessageID: "gm-s", ConversationID: "conv-synthetic", Transport: "SMS", Direction: "incoming", TimestampMs: 100, Phone: "7025550199", Body: "synthetic incoming"},
		{GoogleMessageID: "gm-r", ConversationID: "conv-synthetic", Transport: "RCS", Direction: "outgoing", TimestampMs: 200, Phone: "7025550199", Body: "synthetic outgoing"},
	}, nil
}

func init() {
	if upstream.Commit == "" {
		panic(errors.New("missing libgm pin"))
	}
}
