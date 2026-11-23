package live

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const (
	allowlistTestToken = "local-token-value-0123456789abcd"
	allowlistTestHash  = "abababababababababababababababababababababababababababababababab"
	allowlistBodyMark  = "synthetic-body-marker"
)

func TestValidateStagingURLAllowsOnlyVerifiedHosts(t *testing.T) {
	const path = "/api/sms/staging/rcs-ingest"
	allowed := []string{
		"https://lvpt-event-command-center-2026-sms-staging.vercel.app" + path,
		"https://lvpt-event-command-center-2026-sms-staging.vercel.app:443" + path,
		"https://LVPT-EVENT-COMMAND-CENTER-2026-SMS-STAGING.VERCEL.APP" + path,
		"http://127.0.0.1" + path,
		"http://127.0.0.1:9" + path,
		"https://127.0.0.1:8443" + path,
	}
	for _, endpoint := range allowed {
		if err := ValidateStagingURL(endpoint); err != nil {
			t.Fatalf("verified staging URL was refused: %v", err)
		}
	}

	rejected := []string{
		"https://example.com" + path,
		"https://unrelated.vercel.app" + path,
		"https://lvpt-event-command-center-2026-sms-staging.vercel.app.example" + path,
		"https://evil.lvpt-event-command-center-2026-sms-staging.vercel.app" + path,
		"http://lvpt-event-command-center-2026-sms-staging.vercel.app" + path,
		"https://lvpt-event-command-center-2026-sms-staging.vercel.app:8443" + path,
		"https://127.0.0.1.example" + path,
		"https://[::1]" + path,
		"https://user:secret@lvpt-event-command-center-2026-sms-staging.vercel.app" + path,
	}
	for _, endpoint := range rejected {
		err := ValidateStagingURL(endpoint)
		if err == nil || errors.Is(err, ErrProductionStaging) {
			t.Fatal("external staging URL was accepted")
		}
		assertSafeAllowlistError(t, err)
	}
	if err := ValidateStagingURL("https://lvpt-event-command-center-2026.vercel.app" + path); !errors.Is(err, ErrProductionStaging) {
		t.Fatal("production staging URL was not refused")
	}
}

func TestConfirmAllowlistRejectsExternalHTTPSBeforeDial(t *testing.T) {
	tripwire := &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		t.Errorf("staging check dialed an external host")
		return nil, errors.New("refused")
	})}
	useAllowlistClient(t, tripwire)
	previous := http.DefaultClient
	http.DefaultClient = tripwire
	t.Cleanup(func() { http.DefaultClient = previous })
	endpoints := []string{
		"https://example.com/api/sms/staging/rcs-ingest",
		"https://lvpt-event-command-center-2026-sms-staging.vercel.app.example/api/sms/staging/rcs-ingest",
		"https://user:secret@example.com/api/sms/staging/rcs-ingest",
	}
	for _, endpoint := range endpoints {
		err := ConfirmAllowlist(context.Background(), endpoint, allowlistTestToken, allowlistTestHash)
		if err == nil || errors.Is(err, errAllowlistTransport) {
			t.Fatal("external allowlist check reached the HTTP client")
		}
		assertSafeAllowlistError(t, err)
		posted := PostStaging(context.Background(), endpoint, allowlistTestToken, nil)
		if posted == nil || errors.Is(posted, errAllowlistTransport) {
			t.Fatal("external ingest reached the HTTP client")
		}
		assertSafeAllowlistError(t, posted)
		for _, leaked := range []string{"example.com", "secret", allowlistTestToken} {
			if strings.Contains(err.Error(), leaked) || strings.Contains(posted.Error(), leaked) {
				t.Fatal("rejected staging URL was echoed")
			}
		}
	}
}

func TestConfirmAllowlistClassifiesLocalFailuresWithoutDialing(t *testing.T) {
	useAllowlistClient(t, rejectDialClient(t))
	endpoint := "http://127.0.0.1:9/api/sms/staging/rcs-ingest"

	shortToken := ConfirmAllowlist(context.Background(), endpoint, "short-token", allowlistTestHash)
	if !errors.Is(shortToken, errAllowlistTokenShort) {
		t.Fatal("short token was not classified")
	}
	assertSafeAllowlistError(t, shortToken)

	shortHash := ConfirmAllowlist(context.Background(), endpoint, allowlistTestToken, "abcd")
	if !errors.Is(shortHash, errAllowlistLocalHash) {
		t.Fatal("short contact hash was not classified")
	}
	assertSafeAllowlistError(t, shortHash)

	production := ConfirmAllowlist(context.Background(), "https://lvpt-event-command-center-2026.vercel.app/api/sms/staging/rcs-ingest", allowlistTestToken, allowlistTestHash)
	if !errors.Is(production, ErrProductionStaging) {
		t.Fatal("production staging URL was not refused")
	}
	assertSafeAllowlistError(t, production)

	offHost := ConfirmAllowlist(context.Background(), "http://example.com/api/sms/staging/rcs-ingest", allowlistTestToken, allowlistTestHash)
	if offHost == nil || errors.Is(offHost, errAllowlistTransport) {
		t.Fatal("non-local URL reached the HTTP client")
	}
	assertSafeAllowlistError(t, offHost)
}

func TestConfirmAllowlistClassifiesHTTPResponses(t *testing.T) {
	token := allowlistTestToken
	hash := allowlistTestHash
	if len(token) < 32 || len(hash) != 64 {
		t.Fatal("fixture lengths drifted")
	}

	cases := []struct {
		name   string
		status int
		body   string
		want   error
		exact  string
	}{
		{name: "auth", status: http.StatusUnauthorized, body: `{"ok":false,"reason":"unauthorized","leak":"` + allowlistBodyMark + `"}`, want: errAllowlistAuth},
		{name: "forbidden", status: http.StatusForbidden, body: allowlistBodyMark, want: errAllowlistForbidden},
		{name: "unconfigured", status: http.StatusServiceUnavailable, body: `{"ok":true,"allowed":true}`, want: errAllowlistUnconfigured},
		{name: "hash mismatch", status: http.StatusOK, body: `{"ok":true,"allowed":false,"sendEnabled":false,"leak":"` + allowlistBodyMark + `"}`, want: errAllowlistHashMismatch},
		{name: "non-json", status: http.StatusOK, body: "<html>" + allowlistBodyMark + "</html>", want: errAllowlistNonJSON},
		{name: "empty body", status: http.StatusOK, body: "", want: errAllowlistNonJSON},
		{name: "ok false", status: http.StatusOK, body: `{"ok":false,"allowed":false}`, want: errAllowlistMalformedOK},
		{name: "ok missing", status: http.StatusOK, body: `{"allowed":true}`, want: errAllowlistMalformedOK},
		{name: "ok wrong type", status: http.StatusOK, body: `{"ok":"true","allowed":true}`, want: errAllowlistMalformedOK},
		{name: "allowed missing", status: http.StatusOK, body: `{"ok":true}`, want: errAllowlistMalformedOK},
		{name: "unexpected 400", status: http.StatusBadRequest, body: `{"ok":false,"reason":"invalid_or_unapproved_messages"}`, want: errAllowlistUnexpected, exact: "staging allowlist check refused: unexpected HTTP status 400"},
		{name: "unexpected 415", status: http.StatusUnsupportedMediaType, body: allowlistBodyMark, want: errAllowlistUnexpected, exact: "staging allowlist check refused: unexpected HTTP status 415"},
		{name: "unexpected 502", status: http.StatusBadGateway, body: allowlistBodyMark, want: errAllowlistUnexpected, exact: "staging allowlist check refused: unexpected HTTP status 502"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if r.URL.Path != "/api/sms/staging/rcs-ingest" || r.Method != http.MethodPost {
					t.Errorf("allowlist check used the wrong request line")
				}
				if r.Header.Get("Cookie") != "" || r.Header.Get("x-lvpt-rcs-sync-token") != token {
					t.Errorf("allowlist check sent the wrong headers")
				}
				payload, err := io.ReadAll(io.LimitReader(r.Body, 2048))
				var decoded struct {
					ContactCheck string `json:"contactCheck"`
				}
				if err != nil || json.Unmarshal(payload, &decoded) != nil || decoded.ContactCheck != hash || strings.Contains(string(payload), token) {
					t.Errorf("allowlist check body was not limited to the contact hash")
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tc.status)
				_, _ = io.WriteString(w, tc.body)
			}))
			defer server.Close()
			useAllowlistClient(t, localAllowlistClient(t, nil))

			err := ConfirmAllowlist(context.Background(), server.URL+"/api/sms/staging/rcs-ingest", token, hash)
			if calls != 1 {
				t.Fatalf("server calls = %d", calls)
			}
			if !errors.Is(err, tc.want) {
				t.Fatal("status class did not match")
			}
			exact := tc.exact
			if exact == "" {
				exact = tc.want.Error()
			}
			if err == nil || err.Error() != exact {
				t.Fatal("status text did not match")
			}
			assertSafeAllowlistError(t, err)
		})
	}
}

func TestConfirmAllowlistAcceptsMatchingJSON(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Header.Get("x-lvpt-rcs-sync-token") != allowlistTestToken || r.Header.Get("Cookie") != "" {
			t.Errorf("allowlist check sent the wrong headers")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"ok":true,"allowed":true,"sendEnabled":false}`)
	}))
	defer server.Close()
	useAllowlistClient(t, localAllowlistClient(t, nil))

	if err := ConfirmAllowlist(context.Background(), server.URL+"/api/sms/staging/rcs-ingest", allowlistTestToken, allowlistTestHash); err != nil {
		t.Fatal("matching allowlist was refused")
	}
	if calls != 1 {
		t.Fatalf("server calls = %d", calls)
	}
}

func TestConfirmAllowlistTransportFailureHidesCause(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("closed server was still called")
	}))
	endpoint := server.URL + "/api/sms/staging/rcs-ingest"
	server.Close()
	useAllowlistClient(t, localAllowlistClient(t, nil))

	err := ConfirmAllowlist(context.Background(), endpoint, allowlistTestToken, allowlistTestHash)
	if !errors.Is(err, errAllowlistTransport) || err.Error() != errAllowlistTransport.Error() {
		t.Fatal("transport failure was not classified")
	}
	assertSafeAllowlistError(t, err)
	if strings.Contains(err.Error(), "127.0.0.1") || strings.Contains(err.Error(), "dial") || strings.Contains(err.Error(), endpoint) {
		t.Fatal("transport failure included the raw client error")
	}

	live := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("canceled check was sent")
		w.WriteHeader(http.StatusOK)
	}))
	defer live.Close()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	canceled := ConfirmAllowlist(ctx, live.URL+"/api/sms/staging/rcs-ingest", allowlistTestToken, allowlistTestHash)
	if !errors.Is(canceled, errAllowlistTransport) || strings.Contains(canceled.Error(), "context") {
		t.Fatal("canceled check was not a static transport failure")
	}
	assertSafeAllowlistError(t, canceled)
}

func TestUnexpectedAllowlistStatusOmitsUnusableCodes(t *testing.T) {
	for _, status := range []int{0, -1, 600, 100000} {
		err := unexpectedAllowlistStatus(status)
		if !errors.Is(err, errAllowlistUnexpected) || err.Error() != errAllowlistUnexpected.Error() {
			t.Fatal("unusable HTTP status was interpolated")
		}
	}
}

func useAllowlistClient(t *testing.T, client *http.Client) {
	t.Helper()
	previous := allowlistClient
	allowlistClient = client
	t.Cleanup(func() { allowlistClient = previous })
}

func rejectDialClient(t *testing.T) *http.Client {
	t.Helper()
	return &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		t.Errorf("allowlist check dialed")
		return nil, errors.New("refused")
	})}
}

func localAllowlistClient(t *testing.T, base http.RoundTripper) *http.Client {
	t.Helper()
	if base == nil {
		base = http.DefaultTransport
	}
	return &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Hostname() != "127.0.0.1" {
			t.Errorf("allowlist check left loopback")
			return nil, errors.New("refused")
		}
		return base.RoundTrip(r)
	})}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func assertSafeAllowlistError(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("missing error")
	}
	message := err.Error()
	for _, secret := range []string{allowlistTestToken, allowlistTestHash, allowlistBodyMark, "cookie", "x-lvpt-rcs-sync-token"} {
		if strings.Contains(strings.ToLower(message), strings.ToLower(secret)) {
			t.Fatal("allowlist error included secret material")
		}
	}
}
