package pairui

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const cookieMarker = "synthetic-cookie-marker"

func TestApprovalDoesNotDefaultOn(t *testing.T) {
	auth, err := ParseAuthorization(map[string]string{}, time.Now())
	if err == nil || auth.Approved {
		t.Fatal("missing approval was accepted")
	}
	_, err = ParseAuthorization(map[string]string{"approve": "no"}, time.Now())
	if err == nil {
		t.Fatal("explicit refusal was accepted")
	}
}

func TestPairingHelperFlow(t *testing.T) {
	repo := t.TempDir()
	sealPath := filepath.Join(t.TempDir(), "session.sealed")
	key := bytes.Repeat([]byte{3}, 32)
	var logs bytes.Buffer
	server := testServer(t, NewKeyedProtector(key), sealPath, repo, &logs)
	window := openWindow()

	missing := post(server, "/seal", sealValues(window), false)
	if missing.Code != http.StatusForbidden || !strings.Contains(missing.Body.String(), "authorization required") {
		t.Fatalf("missing authorization: %d %s", missing.Code, missing.Body.String())
	}

	denied := post(server, "/authorize", map[string]string{"approve": "no"}, true)
	if denied.Code != http.StatusForbidden {
		t.Fatalf("refusal status %d", denied.Code)
	}

	accepted := post(server, "/authorize", authValues(window), true)
	if accepted.Code != http.StatusSeeOther {
		t.Fatalf("approval status %d %s", accepted.Code, accepted.Body.String())
	}
	page := get(server, "/cookies")
	if !strings.Contains(page.Body.String(), "owner@example.com") || strings.Contains(page.Body.String(), cookieMarker) {
		t.Fatal("cookie page disclosed pairing material or hid the approved account")
	}

	sealed := post(server, "/seal", sealValues(window), true)
	if sealed.Code != http.StatusSeeOther {
		t.Fatalf("seal status %d %s", sealed.Code, sealed.Body.String())
	}
	stored, err := os.ReadFile(sealPath)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(stored, []byte(cookieMarker)) || bytes.Contains(stored, []byte("owner@example.com")) {
		t.Fatal("sealed file contains plaintext pairing material")
	}
	opened, err := NewKeyedProtector(key).Unprotect(stored)
	if err != nil || !bytes.Contains(opened, []byte(cookieMarker)) {
		t.Fatal("right key could not open the sealed bundle")
	}
	if _, err := NewKeyedProtector(bytes.Repeat([]byte{9}, 32)).Unprotect(stored); err == nil {
		t.Fatal("wrong key opened the sealed bundle")
	}
	if strings.Contains(logs.String(), cookieMarker) || strings.Contains(logs.String(), "owner@example.com") {
		t.Fatalf("logs contained sensitive material: %s", logs.String())
	}
	status := get(server, "/status")
	if strings.Contains(status.Body.String(), cookieMarker) || !strings.Contains(status.Body.String(), `"sendEnabled":false`) || !strings.Contains(status.Body.String(), `"markReadEnabled":false`) {
		t.Fatalf("status leaked material or enabled mutation: %s", status.Body.String())
	}
}

func TestMissingKeyDoesNotWrite(t *testing.T) {
	repo := t.TempDir()
	sealPath := filepath.Join(t.TempDir(), "session.sealed")
	server := testServer(t, NewKeyedProtector(nil), sealPath, repo, io.Discard)
	window := openWindow()
	if post(server, "/authorize", authValues(window), true).Code != http.StatusSeeOther {
		t.Fatal("authorization failed")
	}
	response := post(server, "/seal", sealValues(window), true)
	if response.Code != http.StatusInternalServerError || strings.Contains(response.Body.String(), cookieMarker) {
		t.Fatalf("missing key response: %d %s", response.Code, response.Body.String())
	}
	if _, err := os.Stat(sealPath); !os.IsNotExist(err) {
		t.Fatal("missing key still wrote a file")
	}
}

func TestExpiredAndInterruptedPairing(t *testing.T) {
	repo := t.TempDir()
	sealPath := filepath.Join(t.TempDir(), "session.sealed")
	server := testServer(t, NewKeyedProtector(bytes.Repeat([]byte{3}, 32)), sealPath, repo, io.Discard)
	if err := os.WriteFile(sealPath, []byte("partial"), 0o600); err != nil {
		t.Fatal(err)
	}
	cancelled := post(server, "/cancel", map[string]string{}, true)
	if cancelled.Code != http.StatusOK || !strings.Contains(cancelled.Body.String(), "cancelled") {
		t.Fatalf("cancel: %d %s", cancelled.Code, cancelled.Body.String())
	}
	if _, err := os.Stat(sealPath); !os.IsNotExist(err) {
		t.Fatal("cancel left pairing material behind")
	}

	expired := testServer(t, NewKeyedProtector(bytes.Repeat([]byte{3}, 32)), sealPath, repo, io.Discard)
	expired.started = time.Now().Add(-time.Hour)
	response := post(expired, "/authorize", authValues(openWindow()), true)
	if response.Code != http.StatusForbidden || !strings.Contains(response.Body.String(), "expired") {
		t.Fatalf("expired session: %d %s", response.Code, response.Body.String())
	}
}

func TestRevocationRemovesSealedMaterial(t *testing.T) {
	repo := t.TempDir()
	sealPath := filepath.Join(t.TempDir(), "session.sealed")
	server := testServer(t, NewKeyedProtector(bytes.Repeat([]byte{3}, 32)), sealPath, repo, io.Discard)
	if err := os.WriteFile(sealPath, []byte("sealed-local-material"), 0o600); err != nil {
		t.Fatal(err)
	}
	response := post(server, "/revoke", map[string]string{}, true)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "revoked") {
		t.Fatalf("revoke: %d %s", response.Code, response.Body.String())
	}
	if _, err := os.Stat(sealPath); !os.IsNotExist(err) {
		t.Fatal("revoke left the sealed file")
	}
}

func TestUnauthorizedLocalRequests(t *testing.T) {
	server := testServer(t, NewKeyedProtector(bytes.Repeat([]byte{3}, 32)), filepath.Join(t.TempDir(), "session.sealed"), t.TempDir(), io.Discard)
	outside := post(server, "/authorize", authValues(openWindow()), true)
	outside.Result().Body.Close()
	request := formRequest("/authorize", authValues(openWindow()), server.token)
	request.RemoteAddr = "192.0.2.8:4000"
	recorded := httptest.NewRecorder()
	server.ServeHTTP(recorded, request)
	if recorded.Code != http.StatusForbidden || !strings.Contains(recorded.Body.String(), "forbidden") {
		t.Fatalf("remote address: %d %s", recorded.Code, recorded.Body.String())
	}
	request = formRequest("/authorize", authValues(openWindow()), server.token)
	request.Host = "rebinding.example"
	request.Header.Set("Origin", "http://rebinding.example")
	recorded = httptest.NewRecorder()
	server.ServeHTTP(recorded, request)
	if recorded.Code != http.StatusForbidden {
		t.Fatalf("rebinding host: %d", recorded.Code)
	}
	request = formRequest("/authorize", authValues(openWindow()), "")
	recorded = httptest.NewRecorder()
	server.ServeHTTP(recorded, request)
	if recorded.Code != http.StatusForbidden {
		t.Fatalf("missing csrf: %d", recorded.Code)
	}
}

func TestListenIsLoopbackAndRoutesStayReadOnly(t *testing.T) {
	server, err := New(NewKeyedProtector(bytes.Repeat([]byte{3}, 32)), filepath.Join(t.TempDir(), "session.sealed"), t.TempDir(), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	localURL, err := server.Start()
	if err != nil {
		t.Fatal(err)
	}
	defer server.Shutdown()
	parsed, err := url.Parse(localURL)
	if err != nil || !strings.HasPrefix(parsed.Host, "127.0.0.1:") {
		t.Fatalf("listen address %s", localURL)
	}
	for _, route := range Routes() {
		for _, blocked := range []string{"send", "react", "delete", "typing", "mark-read"} {
			if strings.Contains(route, blocked) {
				t.Fatalf("route %s exposes %s", route, blocked)
			}
		}
	}
	sources := bytes.Buffer{}
	root := filepath.Join("..", "..")
	err = filepath.Walk(filepath.Join(root, "internal", "pairui"), func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil || info.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		text, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		sources.Write(text)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	text := sources.String()
	for _, forbidden := range []string{"net.Dial", "http.Get(", "http.Post(", "http.Client", "0.0.0.0", "messages.google.com", "SendMessage(", "MarkRead("} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("pairing helper contains %s", forbidden)
		}
	}
}

func testServer(t *testing.T, protector Protector, sealPath, repo string, log io.Writer) *Server {
	t.Helper()
	server, err := New(protector, sealPath, repo, log)
	if err != nil {
		t.Fatal(err)
	}
	server.host = "127.0.0.1:9"
	server.origin = "http://127.0.0.1:9"
	return server
}

func openWindow() map[string]string {
	start := time.Now().Add(time.Minute).UTC().Format(time.RFC3339)
	end := time.Now().Add(30 * time.Minute).UTC().Format(time.RFC3339)
	return map[string]string{"window_start": start, "window_end": end}
}

func authValues(window map[string]string) map[string]string {
	return map[string]string{
		"approve": "yes", "google_account": "owner@example.com", "contact": "2025550177",
		"window_start": window["window_start"], "window_end": window["window_end"],
	}
}

func sealValues(window map[string]string) map[string]string {
	values := authValues(window)
	for _, name := range RequiredCookies {
		values[name] = cookieMarker + "-" + name
	}
	return values
}

func get(server *Server, path string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodGet, path, nil)
	request.RemoteAddr = "127.0.0.1:40000"
	request.Host = server.host
	recorded := httptest.NewRecorder()
	server.ServeHTTP(recorded, request)
	return recorded
}

func post(server *Server, path string, values map[string]string, csrf bool) *httptest.ResponseRecorder {
	token := ""
	if csrf {
		token = server.token
	}
	request := formRequest(path, values, token)
	request.Host = server.host
	request.Header.Set("Origin", server.origin)
	recorded := httptest.NewRecorder()
	server.ServeHTTP(recorded, request)
	return recorded
}

func formRequest(path string, values map[string]string, token string) *http.Request {
	form := url.Values{}
	for key, value := range values {
		form.Set(key, value)
	}
	if token != "" {
		form.Set("csrf", token)
	}
	request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(form.Encode()))
	request.RemoteAddr = "127.0.0.1:40000"
	request.Host = "127.0.0.1:9"
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Origin", "http://127.0.0.1:9")
	if token != "" {
		request.AddCookie(&http.Cookie{Name: "lvpt_pair", Value: token})
	}
	return request
}
