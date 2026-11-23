package pairui

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"html/template"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"lvpt.local/google-messages-collector/internal/preflight"
)

const SessionTTL = 10 * time.Minute

var RequiredCookies = []string{"SID", "HSID", "SSID", "APISID", "SAPISID", "OSID"}

var allowedRoutes = []string{
	"GET /",
	"POST /authorize",
	"GET /cookies",
	"POST /seal",
	"POST /cancel",
	"POST /revoke",
	"GET /status",
}

func Routes() []string {
	return append([]string(nil), allowedRoutes...)
}

type Server struct {
	mu         sync.Mutex
	token      string
	started    time.Time
	ttl        time.Duration
	auth       *Authorization
	protector  Protector
	sealPath   string
	repoRoot   string
	log        io.Writer
	host       string
	origin     string
	listener   net.Listener
	httpServer *http.Server
	stopped    chan struct{}
	stopOnce   sync.Once
}

func New(protector Protector, sealPath, repoRoot string, log io.Writer) (*Server, error) {
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		return nil, err
	}
	if log == nil {
		log = io.Discard
	}
	return &Server{
		token:     hex.EncodeToString(token),
		started:   time.Now(),
		ttl:       SessionTTL,
		protector: protector,
		sealPath:  sealPath,
		repoRoot:  repoRoot,
		log:       log,
		stopped:   make(chan struct{}),
	}, nil
}

func (s *Server) Start() (string, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	s.listener = listener
	s.host = listener.Addr().String()
	s.origin = "http://" + s.host
	s.httpServer = &http.Server{Handler: s, ReadHeaderTimeout: 5 * time.Second}
	s.mu.Unlock()
	go func() {
		err := s.httpServer.Serve(listener)
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			s.logLine("pairing helper stopped")
		}
		s.stopOnce.Do(func() { close(s.stopped) })
	}()
	return s.origin + "/", nil
}

func (s *Server) Shutdown() {
	s.mu.Lock()
	server := s.httpServer
	s.mu.Unlock()
	if server != nil {
		_ = server.Close()
	}
	s.stopOnce.Do(func() { close(s.stopped) })
}

func (s *Server) Wait() {
	<-s.stopped
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !loopback(r.RemoteAddr) || !s.trustedHost(r.Host) {
		s.logLine("forbidden")
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if r.Method == http.MethodPost && !s.trustedOrigin(r) {
		s.logLine("forbidden")
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if s.expired() {
		s.logLine("expired")
		s.Shutdown()
		http.Error(w, "expired", http.StatusForbidden)
		return
	}
	switch r.Method + " " + r.URL.Path {
	case "GET /":
		s.page(w, authorizePage)
	case "POST /authorize":
		s.authorize(w, r)
	case "GET /cookies":
		s.cookiesPage(w)
	case "POST /seal":
		s.seal(w, r)
	case "POST /cancel":
		s.cancel(w, r)
	case "POST /revoke":
		s.revoke(w, r)
	case "GET /status":
		s.status(w)
	default:
		http.NotFound(w, r)
	}
}

func (s *Server) authorize(w http.ResponseWriter, r *http.Request) {
	values, ok := s.form(w, r)
	if !ok {
		return
	}
	auth, err := ParseAuthorization(values, time.Now())
	if err != nil || !auth.Approved {
		s.logLine("authorization rejected")
		http.Error(w, "authorization required", http.StatusForbidden)
		return
	}
	s.mu.Lock()
	s.auth = &auth
	s.mu.Unlock()
	s.logLine("authorization accepted")
	http.Redirect(w, r, "/cookies", http.StatusSeeOther)
}

func (s *Server) cookiesPage(w http.ResponseWriter) {
	s.mu.Lock()
	auth := s.auth
	s.mu.Unlock()
	if auth == nil || !auth.Approved {
		http.Error(w, "authorization required", http.StatusForbidden)
		return
	}
	s.page(w, cookiesPage)
}

func (s *Server) seal(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	auth := s.auth
	s.mu.Unlock()
	if auth == nil || !auth.Approved {
		s.logLine("authorization required")
		http.Error(w, "authorization required", http.StatusForbidden)
		return
	}
	values, ok := s.form(w, r)
	if !ok {
		return
	}
	if values["password"] != "" || values["passwd"] != "" {
		s.logLine("password rejected")
		http.Error(w, "password is not used", http.StatusBadRequest)
		return
	}
	cookies := map[string]string{}
	for _, name := range RequiredCookies {
		value := strings.TrimSpace(values[name])
		if value == "" || strings.ContainsAny(value, "\r\n") || len(value) > 4096 {
			s.logLine("pairing material rejected")
			http.Error(w, "pairing material incomplete", http.StatusBadRequest)
			return
		}
		cookies[name] = value
	}
	if extra := strings.TrimSpace(values["__Secure-1PSIDTS"]); extra != "" {
		cookies["__Secure-1PSIDTS"] = extra
	}
	payload, err := json.Marshal(struct {
		Authorization Authorization
		Cookies       map[string]string
	}{Authorization: *auth, Cookies: cookies})
	if err != nil {
		http.Error(w, "seal failed", http.StatusInternalServerError)
		return
	}
	sealed, err := s.protector.Protect(payload)
	for i := range payload {
		payload[i] = 0
	}
	if err != nil {
		s.logLine("seal failed")
		http.Error(w, "seal failed", http.StatusInternalServerError)
		return
	}
	if err := writeSealed(s.sealPath, s.repoRoot, sealed); err != nil {
		s.logLine("seal failed")
		http.Error(w, "seal failed", http.StatusInternalServerError)
		return
	}
	s.logLine("pairing material sealed")
	http.Redirect(w, r, "/status", http.StatusSeeOther)
	s.Shutdown()
}

func (s *Server) cancel(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.form(w, r); !ok {
		return
	}
	_ = removeSealed(s.sealPath, s.repoRoot)
	s.mu.Lock()
	s.auth = nil
	s.mu.Unlock()
	s.logLine("cancelled")
	http.Error(w, "cancelled", http.StatusOK)
	s.Shutdown()
}

func (s *Server) revoke(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.form(w, r); !ok {
		return
	}
	if err := removeSealed(s.sealPath, s.repoRoot); err != nil {
		s.logLine("revoke failed")
		http.Error(w, "revoke failed", http.StatusInternalServerError)
		return
	}
	s.mu.Lock()
	s.auth = nil
	s.mu.Unlock()
	s.logLine("revoked")
	http.Error(w, "revoked", http.StatusOK)
	s.Shutdown()
}

func (s *Server) status(w http.ResponseWriter) {
	s.mu.Lock()
	approved := s.auth != nil && s.auth.Approved
	s.mu.Unlock()
	_, sealed := os.Stat(s.sealPath)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok": true, "approved": approved, "sealed": sealed == nil,
		"sendEnabled": false, "markReadEnabled": false, "googleSessionOpened": false,
		"access": "read-only collection for one approved contact during the stated window",
	})
}

func (s *Server) form(w http.ResponseWriter, r *http.Request) (map[string]string, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, 32<<10)
	if err := r.ParseForm(); err != nil {
		http.Error(w, "forbidden", http.StatusForbidden)
		return nil, false
	}
	cookie, err := r.Cookie("lvpt_pair")
	if err != nil || cookie.Value == "" || cookie.Value != s.token || r.Form.Get("csrf") != s.token {
		s.logLine("forbidden")
		http.Error(w, "forbidden", http.StatusForbidden)
		return nil, false
	}
	values := map[string]string{}
	for key, items := range r.Form {
		if len(items) > 0 {
			values[key] = items[0]
		}
	}
	return values, true
}

func (s *Server) page(w http.ResponseWriter, page *template.Template) {
	http.SetCookie(w, &http.Cookie{
		Name: "lvpt_pair", Value: s.token, Path: "/", HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
	})
	s.mu.Lock()
	auth := s.auth
	s.mu.Unlock()
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = page.Execute(w, map[string]any{"Token": s.token, "Auth": auth})
}

func (s *Server) trustedHost(host string) bool {
	s.mu.Lock()
	expected := s.host
	s.mu.Unlock()
	if expected == "" {
		return host == "127.0.0.1" || strings.HasPrefix(host, "127.0.0.1:")
	}
	return host == expected
}

func (s *Server) trustedOrigin(r *http.Request) bool {
	s.mu.Lock()
	origin := s.origin
	s.mu.Unlock()
	if origin == "" {
		origin = "http://" + r.Host
	}
	if r.Header.Get("Origin") != origin {
		return false
	}
	site := r.Header.Get("Sec-Fetch-Site")
	return site == "" || site == "same-origin"
}

func (s *Server) expired() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return !time.Now().Before(s.started.Add(s.ttl))
}

func (s *Server) logLine(message string) {
	if strings.ContainsAny(message, "\r\n") {
		message = "log rejected"
	}
	_, _ = io.WriteString(s.log, message+"\n")
}

func loopback(remote string) bool {
	host, _, err := net.SplitHostPort(remote)
	if err != nil {
		host = remote
	}
	return host == "127.0.0.1"
}

func writeSealed(path, repo string, sealed []byte) error {
	if err := preflight.SessionKeyAllowed(path, repo); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	return os.WriteFile(path, sealed, 0o600)
}

func removeSealed(path, repo string) error {
	if path == "" {
		return nil
	}
	if err := preflight.SessionKeyAllowed(path, repo); err != nil {
		return err
	}
	info, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_WRONLY, 0)
	if err == nil {
		_, _ = file.Write(bytes.Repeat([]byte{0}, int(info.Size())))
		_ = file.Close()
	}
	return os.Remove(path)
}

func RevokeFile(path, repo string) error {
	return removeSealed(path, repo)
}

var authorizePage = template.Must(template.New("authorize").Parse(`<!doctype html>
<html><head><meta charset="utf-8"><title>LVPT local pairing</title></head>
<body>
<h1>Local read-only pairing</h1>
<p>This page is on this computer only. It does not ask for the Google account password.</p>
<p>The helper can seal pairing material for one Google account and one consenting contact, for a window of at most two hours. It cannot send, react, delete, type, or mark messages read. Unrelated conversation previews are not saved. No Google session is opened by this page.</p>
<form method="post" action="/authorize">
<input type="hidden" name="csrf" value="{{.Token}}">
<label>Google account <input name="google_account" autocomplete="off" required></label>
<label>One contact <input name="contact" autocomplete="off" required></label>
<label>Window start <input name="window_start" type="datetime-local" required></label>
<label>Window end <input name="window_end" type="datetime-local" required></label>
<label>Approval
<select name="approve">
<option value="no" selected>No</option>
<option value="yes">Yes, I approve this read-only local pairing</option>
</select>
</label>
<button type="submit">Continue</button>
</form>
<form method="post" action="/cancel"><input type="hidden" name="csrf" value="{{.Token}}"><button type="submit">Cancel</button></form>
</body></html>`))

var cookiesPage = template.Must(template.New("cookies").Parse(`<!doctype html>
<html><head><meta charset="utf-8"><title>LVPT local seal</title></head>
<body>
<h1>Seal pairing material</h1>
<p>Approved account {{.Auth.GoogleAccount}}. Contact {{.Auth.Contact}}. Window {{.Auth.WindowStart}} to {{.Auth.WindowEnd}}.</p>
<p>Copy the Google Messages cookies from this computer into this form. Do not paste them into chat, email, or a hosted site. No browser extension is used, and the regular browser profile is not read automatically.</p>
<form method="post" action="/seal">
<input type="hidden" name="csrf" value="{{.Token}}">
<label>SID <input name="SID" autocomplete="off"></label>
<label>HSID <input name="HSID" autocomplete="off"></label>
<label>SSID <input name="SSID" autocomplete="off"></label>
<label>APISID <input name="APISID" autocomplete="off"></label>
<label>SAPISID <input name="SAPISID" autocomplete="off"></label>
<label>OSID <input name="OSID" autocomplete="off"></label>
<label>__Secure-1PSIDTS <input name="__Secure-1PSIDTS" autocomplete="off"></label>
<button type="submit">Seal and close</button>
</form>
<form method="post" action="/revoke"><input type="hidden" name="csrf" value="{{.Token}}"><button type="submit">Revoke local credentials</button></form>
<form method="post" action="/cancel"><input type="hidden" name="csrf" value="{{.Token}}"><button type="submit">Cancel</button></form>
</body></html>`))
