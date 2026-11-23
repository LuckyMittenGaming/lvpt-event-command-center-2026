package pairui

import (
	"errors"
	"net/mail"
	"strings"
	"time"
)

const MaxWindow = 2 * time.Hour

type Authorization struct {
	Approved      bool
	GoogleAccount string
	Contact       string
	WindowStart   time.Time
	WindowEnd     time.Time
}

func ParseAuthorization(values map[string]string, now time.Time) (Authorization, error) {
	auth := Authorization{}
	if strings.TrimSpace(values["approve"]) != "yes" {
		return auth, errors.New("owner approval is required")
	}
	account := strings.TrimSpace(values["google_account"])
	parsed, err := mail.ParseAddress(account)
	if err != nil || parsed.Address != account || !strings.Contains(account, "@") {
		return auth, errors.New("one Google account address is required")
	}
	contact, err := oneContact(values["contact"])
	if err != nil {
		return auth, err
	}
	start, err := parseTime(values["window_start"])
	if err != nil {
		return auth, errors.New("collection window start is required")
	}
	end, err := parseTime(values["window_end"])
	if err != nil {
		return auth, errors.New("collection window end is required")
	}
	if !end.After(start) || end.Sub(start) > MaxWindow {
		return auth, errors.New("collection window must be a positive span of at most two hours")
	}
	if end.Before(now) || start.Before(now.Add(-5*time.Minute)) {
		return auth, errors.New("collection window is not open")
	}
	auth.Approved = true
	auth.GoogleAccount = account
	auth.Contact = contact
	auth.WindowStart = start
	auth.WindowEnd = end
	return auth, nil
}

func oneContact(value string) (string, error) {
	if strings.ContainsAny(value, ",;") {
		return "", errors.New("only one contact can be approved")
	}
	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, value)
	if len(digits) == 11 && digits[0] == '1' {
		digits = digits[1:]
	}
	if len(digits) != 10 {
		return "", errors.New("one consenting contact number is required")
	}
	return digits, nil
}

func parseTime(value string) (time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, errors.New("missing time")
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed, nil
	}
	return time.ParseInLocation("2006-01-02T15:04", value, time.Local)
}
