package router

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"nokia_modem/internal/config"
)

type LoginSession struct {
	SID    string
	Token  string
	PubKey string
	Raw    map[string]interface{}
}

type Client struct {
	baseURL    string
	username   string
	password   string
	httpClient *http.Client

	mu          sync.Mutex
	cachedLogin *LoginSession
}

func NewClient(cfg config.Config) *Client {
	return &Client{
		baseURL:  fmt.Sprintf("http://%s", cfg.RouterHost),
		username: cfg.RouterUser,
		password: cfg.RouterPassword,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (c *Client) GetLogin(force bool) (*LoginSession, map[string]interface{}, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !force && c.cachedLogin != nil && c.cachedLogin.SID != "" {
		return c.cachedLogin, nil, nil
	}

	pre, _ := c.GetPreloginStatus(context.Background())
	preToken := getString(pre, "token")

	nonceResp, err := c.getNonce(context.Background())
	if err != nil {
		return nil, nil, fmt.Errorf("get nonce: %w", err)
	}

	saltResp, err := c.getSalt(context.Background(), c.username, nonceResp)
	if err != nil {
		return nil, nil, fmt.Errorf("get salt: %w", err)
	}

	loginResp, err := c.login(context.Background(), c.username, c.password, nonceResp, saltResp)
	if err != nil {
		return nil, nil, fmt.Errorf("login: %w", err)
	}

	sid := getString(loginResp, "sid")
	if sid == "" {
		// Login failed (likely invalid credentials). Do not cache.
		return nil, loginResp, nil
	}

	tok := getString(loginResp, "token")
	if tok == "" {
		tok = preToken
	}

	session := &LoginSession{
		SID:    sid,
		Token:  tok,
		PubKey: getString(nonceResp, "pubkey"),
		Raw:    loginResp,
	}
	c.cachedLogin = session
	return session, nil, nil
}

func (c *Client) getNonce(ctx context.Context) (map[string]interface{}, error) {
	form := url.Values{
		"userName": {c.username},
	}
	return c.postForm(ctx, "login_web_app.cgi?nonce", form, nil)
}

func (c *Client) getSalt(ctx context.Context, username string, nonceResp map[string]interface{}) (map[string]interface{}, error) {
	nonce := getString(nonceResp, "nonce")
	nonceURL := base64urlEscape(nonce)
	userHash := sha256url(username, nonce)
	form := url.Values{
		"userhash": {userHash},
		"nonce":    {nonceURL},
	}
	return c.postForm(ctx, "login_web_app.cgi?salt", form, nil)
}

func (c *Client) login(ctx context.Context, username, password string, nonceResp, saltResp map[string]interface{}) (map[string]interface{}, error) {
	nonce := getString(nonceResp, "nonce")
	if nonce == "" {
		return nil, fmt.Errorf("nonce missing from response")
	}
	randomKey := getString(nonceResp, "randomKey")
	iterations := getInt(nonceResp["iterations"])
	alati := getString(saltResp, "alati")

	nonceURL := base64urlEscape(nonce)
	userHash := sha256url(username, nonce)
	randomKeyHash := sha256url(randomKey, nonce)

	hashedPassword := alati + password
	if iterations >= 1 {
		hashedPassword = sha256Hex([]byte(hashedPassword))
		for i := 1; i < iterations; i++ {
			bytes, err := hex.DecodeString(hashedPassword)
			if err != nil {
				return nil, fmt.Errorf("decode hashed password: %w", err)
			}
			hashedPassword = sha256Hex(bytes)
		}
	}

	responseHash := sha256url(
		sha256Join(username, strings.ToLower(hashedPassword)),
		nonce,
	)

	encKey, encIV, err := generateEncryptionParams()
	if err != nil {
		return nil, err
	}

	form := url.Values{
		"userhash":      {userHash},
		"RandomKeyhash": {randomKeyHash},
		"response":      {responseHash},
		"nonce":         {nonceURL},
		"enckey":        {encKey},
		"enciv":         {encIV},
	}

	return c.postForm(ctx, "login_web_app.cgi?salt", form, nil)
}

func (c *Client) GetPreloginStatus(ctx context.Context) (map[string]interface{}, error) {
	return c.get(ctx, "prelogin_status_web_app.cgi", nil)
}

func (c *Client) GetOverviewData(ctx context.Context, session *LoginSession) (map[string]interface{}, error) {
	return c.getAuthenticated(ctx, "overview_get_web_app.cgi", session, nil)
}

func (c *Client) GetWanStatus(ctx context.Context, session *LoginSession) (map[string]interface{}, error) {
	return c.getAuthenticated(ctx, "show_wan_status_web_app.cgi", session, nil)
}

func (c *Client) GetDeviceStatus(ctx context.Context, session *LoginSession) (map[string]interface{}, error) {
	return c.getAuthenticated(ctx, "device_status_web_app.cgi?getroot", session, nil)
}

func (c *Client) GetNetworkClientStatus(ctx context.Context, session *LoginSession) (map[string]interface{}, error) {
	return c.getAuthenticated(ctx, "device_home_nw_client_status_web_app.cgi", session, nil)
}

func (c *Client) PostServiceData(ctx context.Context, session *LoginSession) (map[string]interface{}, error) {
	payload := map[string]interface{}{
		"version":    1,
		"csrf_token": session.Token,
		"id":         1,
		"interface":  "Nokia.GenericService",
		"service":    "OAM",
		"function":   "GetCAState",
		"paralist":   []interface{}{},
	}
	return c.postAuthenticatedJSON(ctx, "service_function_web_app.cgi", session, payload)
}

func (c *Client) GetStatusWeb(ctx context.Context, session *LoginSession) (map[string]interface{}, error) {
	return c.getAuthenticated(ctx, "status_get_web_app.cgi", session, nil)
}

func (c *Client) GetWlan24Configs(ctx context.Context, session *LoginSession) (map[string]interface{}, error) {
	return c.getAuthenticated(ctx, "wlan_config_status_web_app.cgi", session, nil)
}

func (c *Client) GetWlan5Configs(ctx context.Context, session *LoginSession) (map[string]interface{}, error) {
	return c.getAuthenticated(ctx, "wlan_config_status_web_app.cgi?v=11ac", session, nil)
}

func (c *Client) GetLedState(ctx context.Context, session *LoginSession) (map[string]interface{}, error) {
	return c.getAuthenticated(ctx, "ledctrl_status_web_app.cgi", session, nil)
}

func (c *Client) LedState(ctx context.Context, session *LoginSession, enable bool) (map[string]interface{}, error) {
	state := "off"
	if enable {
		state = "on"
	}
	plaintext := "EnableGbl=" + state + "&EnableSigGbl=" + state + "&csrf_token="
	return c.PostCSRFEncrypted(ctx, "ledctrl_web_app.cgi?SetLedGlb", session, plaintext)
}

func (c *Client) PostSetAPN(ctx context.Context, session *LoginSession, newAPN string) (map[string]interface{}, error) {
	payload := map[string]interface{}{
		"version":    1,
		"csrf_token": session.Token,
		"id":         1,
		"interface":  "Nokia.GenericService",
		"service":    "OAM",
		"function":   "ModifyAPN",
		"paralist": []interface{}{
			map[string]interface{}{
				"WorkMode":           "RouteMode",
				"AccessPointName":    newAPN,
				"Services":           "TR069,INTERNET",
				"VOIP":               nil,
				"INTERNET":           true,
				"IPTV":               nil,
				"UserName":           "",
				"Password":           "",
				"confirmPwd":         nil,
				"AuthenticationMode": "None",
				"IPv4":               true,
				"IPv6":               true,
				"IPv4NetMask":        "",
				"MTUSize":            1500,
				"APNInstanceID":      1,
				"ipMode":             3,
				"mtuMode":            "Manual",
				"EthernetInterface":  "",
				"VLANID":             0,
			},
		},
	}
	return c.postAuthenticatedJSON(ctx, "service_function_web_app.cgi", session, payload)
}

func (c *Client) Reboot(ctx context.Context, session *LoginSession) (map[string]interface{}, error) {
	payload := map[string]interface{}{
		"version":    1,
		"csrf_token": session.Token,
		"id":         1,
		"interface":  "Nokia.GenericService",
		"service":    "OAM",
		"function":   "Reboot",
		"paralist":   []interface{}{},
	}
	return c.postAuthenticatedJSON(ctx, "service_function_web_app.cgi", session, payload)
}

func (c *Client) GetLanStatusWeb(ctx context.Context, session *LoginSession) (map[string]interface{}, error) {
	return c.getAuthenticated(ctx, "lan_status_web_app.cgi?wlan=", session, nil)
}

func (c *Client) GetSmsList(ctx context.Context, session *LoginSession) (map[string]interface{}, error) {
	payload := map[string]interface{}{
		"version":    1,
		"csrf_token": session.Token,
		"id":         1,
		"interface":  "Nokia.GenericService",
		"service":    "OAM",
		"function":   "GetSMSList",
		"paralist":   []interface{}{},
	}
	return c.postAuthenticatedJSON(ctx, "service_function_web_app.cgi", session, payload)
}

func (c *Client) PostCellularIdentification(ctx context.Context, session *LoginSession) (map[string]interface{}, error) {
	payload := map[string]interface{}{
		"version":    1,
		"csrf_token": session.Token,
		"id":         1,
		"interface":  "Nokia.GenericService",
		"service":    "OAM",
		"function":   "GetCellularNetworkIdentification",
		"paralist":   []interface{}{},
	}
	return c.postAuthenticatedJSON(ctx, "service_function_web_app.cgi", session, payload)
}

func (c *Client) SetSmsState(ctx context.Context, session *LoginSession, smsID, smsUnread string) (map[string]interface{}, error) {
	shouldUnread := parseBoolString(smsUnread, true)
	payload := map[string]interface{}{
		"version":    1,
		"csrf_token": session.Token,
		"id":         1,
		"interface":  "Nokia.GenericService",
		"service":    "OAM",
		"function":   "SetSMSState",
		"paralist": []interface{}{
			map[string]interface{}{"SMSID": smsID},
			map[string]interface{}{"SMSUnread": shouldUnread},
		},
	}
	return c.postAuthenticatedJSON(ctx, "service_function_web_app.cgi", session, payload)
}

func parseBoolString(value string, defaultValue bool) bool {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	switch trimmed {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	case "":
		return defaultValue
	default:
		parsed, err := strconv.ParseFloat(trimmed, 64)
		if err == nil {
			return parsed != 0
		}
		return defaultValue
	}
}

func (c *Client) DeleteSms(ctx context.Context, session *LoginSession, smsIDs []string, deleteAll bool) (map[string]interface{}, error) {
	if deleteAll {
		smsIDs = []string{}
	} else if len(smsIDs) == 0 {
		return nil, fmt.Errorf("no SMS IDs provided")
	}
	payload := map[string]interface{}{
		"version":    1,
		"csrf_token": session.Token,
		"id":         1,
		"interface":  "Nokia.GenericService",
		"service":    "OAM",
		"function":   "DeleteSMS",
		"paralist": []interface{}{
			map[string]interface{}{
				"SMSList": smsIDs,
			},
		},
	}
	return c.postAuthenticatedJSON(ctx, "service_function_web_app.cgi", session, payload)
}

func (c *Client) get(ctx context.Context, endpoint string, headers map[string]string) (map[string]interface{}, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/"+endpoint, nil)
	if err != nil {
		return nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	return c.doRequest(req)
}

func (c *Client) postForm(ctx context.Context, endpoint string, form url.Values, headers map[string]string) (map[string]interface{}, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/"+endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	return c.doRequest(req)
}

func (c *Client) postJSON(ctx context.Context, endpoint string, payload interface{}, headers map[string]string) (map[string]interface{}, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/"+endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	return c.doRequest(req)
}

func (c *Client) getAuthenticated(ctx context.Context, endpoint string, session *LoginSession, headers map[string]string) (map[string]interface{}, error) {
	if headers == nil {
		headers = map[string]string{}
	}
	headers["Cookie"] = "sid=" + session.SID
	return c.get(ctx, endpoint, headers)
}

// DebugGet issues a raw GET request against the router without authentication handling.
func (c *Client) DebugGet(ctx context.Context, endpoint string, headers map[string]string) (map[string]interface{}, error) {
	return c.get(ctx, endpoint, headers)
}

// DebugPostForm sends an x-www-form-urlencoded POST without authentication.
func (c *Client) DebugPostForm(ctx context.Context, endpoint string, form url.Values, headers map[string]string) (map[string]interface{}, error) {
	return c.postForm(ctx, endpoint, form, headers)
}

// DebugPostJSON performs a JSON POST without authentication.
func (c *Client) DebugPostJSON(ctx context.Context, endpoint string, payload interface{}, headers map[string]string) (map[string]interface{}, error) {
	return c.postJSON(ctx, endpoint, payload, headers)
}

// DebugGetAuthenticated allows manual debugging against custom endpoints.
func (c *Client) DebugGetAuthenticated(ctx context.Context, endpoint string, session *LoginSession, headers map[string]string) (map[string]interface{}, error) {
	return c.getAuthenticated(ctx, endpoint, session, headers)
}

// DebugPostAuthenticatedJSON performs a JSON POST including the session cookie.
func (c *Client) DebugPostAuthenticatedJSON(ctx context.Context, endpoint string, session *LoginSession, payload interface{}, headers map[string]string) (map[string]interface{}, error) {
	if headers == nil {
		headers = map[string]string{}
	}
	headers["Cookie"] = "sid=" + session.SID
	return c.postJSON(ctx, endpoint, payload, headers)
}

func (c *Client) postAuthenticatedJSON(ctx context.Context, endpoint string, session *LoginSession, payload interface{}) (map[string]interface{}, error) {
	headers := map[string]string{
		"Cookie": "sid=" + session.SID,
	}
	return c.postJSON(ctx, endpoint, payload, headers)
}

func (c *Client) doRequest(req *http.Request) (map[string]interface{}, error) {
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("request failed: %s (%s)", resp.Status, string(body))
	}

	var data map[string]interface{}
	decoder := json.NewDecoder(resp.Body)
	if err := decoder.Decode(&data); err != nil {
		return nil, err
	}
	return data, nil
}

func base64urlEscape(s string) string {
	s = strings.ReplaceAll(s, "+", "-")
	s = strings.ReplaceAll(s, "/", "_")
	s = strings.ReplaceAll(s, "=", ".")
	return s
}

func sha256Join(v1, v2 string) string {
	h := sha256.Sum256([]byte(v1 + ":" + v2))
	return base64.StdEncoding.EncodeToString(h[:])
}

func sha256url(v1, v2 string) string {
	return base64urlEscape(sha256Join(v1, v2))
}

func generateEncryptionParams() (string, string, error) {
	key, err := generateRandomBase64()
	if err != nil {
		return "", "", err
	}
	iv, err := generateRandomBase64()
	if err != nil {
		return "", "", err
	}
	return base64urlEscape(key), base64urlEscape(iv), nil
}

func generateRandomBase64() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(buf), nil
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func getString(m map[string]interface{}, key string) string {
	if m == nil {
		return ""
	}
	if v, ok := m[key]; ok {
		switch val := v.(type) {
		case string:
			return val
		case json.Number:
			if i, err := val.Int64(); err == nil {
				return strconv.FormatInt(i, 10)
			}
			if f, err := val.Float64(); err == nil {
				return strconv.FormatFloat(f, 'f', -1, 64)
			}
			return val.String()
		case fmt.Stringer:
			return val.String()
		case float64:
			return fmt.Sprintf("%.0f", val)
		default:
			return fmt.Sprintf("%v", val)
		}
	}
	return ""
}

func getInt(v interface{}) int {
	switch val := v.(type) {
	case nil:
		return 0
	case int:
		return val
	case int32:
		return int(val)
	case int64:
		return int(val)
	case float32:
		return int(val)
	case float64:
		return int(val)
	case json.Number:
		if i64, err := val.Int64(); err == nil {
			return int(i64)
		}
		if f64, err := val.Float64(); err == nil {
			return int(f64)
		}
		return 0
	case string:
		if parsed, err := strconv.Atoi(strings.TrimSpace(val)); err == nil {
			return parsed
		}
		return 0
	default:
		return 0
	}
}

func (c *Client) ClearCache() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cachedLogin = nil
}
