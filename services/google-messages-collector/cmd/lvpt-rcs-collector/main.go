package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"runtime"

	"lvpt.local/google-messages-collector/internal/collect"
	"lvpt.local/google-messages-collector/internal/preflight"
	"lvpt.local/google-messages-collector/internal/upstream"
)

func main() {
	synthetic := flag.Bool("synthetic", false, "run the offline synthetic rehearsal and exit")
	check := flag.Bool("preflight", false, "check the local Windows staging path and exit")
	flag.Parse()
	if *check {
		if err := runPreflight(); err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			os.Exit(1)
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
