package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"nokia_modem/internal/config"
	"nokia_modem/internal/router"
	"nokia_modem/internal/settings"
	webtpl "nokia_modem/templates"
)

type Server struct {
	clientMu sync.RWMutex
	client   *router.Client

	cfgMu   sync.RWMutex
	cfgPath string
	cfg     config.Config

	store      *settings.Store
	logger     *log.Logger
	httpClient *http.Client

	smsArchive *smsArchive

	pollerMu            sync.Mutex
	pollerCancel        context.CancelFunc
	pollerWG            sync.WaitGroup
	smsForwardingActive bool

	reloadFn func(config.Config)
}

func New(client *router.Client, store *settings.Store, cfgPath string, cfg config.Config, reloadFn func(config.Config)) *Server {
	smsPath := "sms.json"
	if trimmed := strings.TrimSpace(cfgPath); trimmed != "" {
		smsPath = filepath.Join(filepath.Dir(trimmed), "sms.json")
	}

	srv := &Server{
		client:     client,
		cfgPath:    cfgPath,
		cfg:        cfg,
		store:      store,
		logger:     log.New(os.Stdout, "[server] ", log.LstdFlags),
		httpClient: &http.Client{Timeout: 10 * time.Second},
		smsArchive: newSmsArchive(smsPath),
		reloadFn:   reloadFn,
	}

	srv.configureSmsForwarding(cfg)
	return srv
}

func (s *Server) getClient() *router.Client {
	s.clientMu.RLock()
	defer s.clientMu.RUnlock()
	return s.client
}

func (s *Server) setClient(client *router.Client) {
	s.clientMu.Lock()
	defer s.clientMu.Unlock()
	s.client = client
}

func (s *Server) getConfig() config.Config {
	s.cfgMu.RLock()
	defer s.cfgMu.RUnlock()
	return s.cfg
}

func (s *Server) setConfig(cfg config.Config) {
	s.cfgMu.Lock()
	defer s.cfgMu.Unlock()
	s.cfg = cfg
}

// Config returns the current configuration snapshot.
func (s *Server) Config() config.Config {
	return s.getConfig()
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/daily_usage", s.handleDailyUsage)
	mux.HandleFunc("/api/get_data_expired", s.handleGetDataExpired)
	mux.HandleFunc("/api/set_data_expired", s.handleSetDataExpired)
	mux.HandleFunc("/api/prelogin_status", s.handlePreloginStatus)
	mux.HandleFunc("/api/overview", s.handleOverview)
	mux.HandleFunc("/api/wan_status", s.handleWanStatus)
	mux.HandleFunc("/api/device_status", s.handleDeviceStatus)
	mux.HandleFunc("/api/network_clients", s.handleNetworkClients)
	mux.HandleFunc("/api/service_data", s.handleServiceData)
	mux.HandleFunc("/api/status_web", s.handleStatusWeb)
	mux.HandleFunc("/api/set_apn", s.handleSetAPN)
	mux.HandleFunc("/api/wlan_configs_24g", s.handleWlan24)
	mux.HandleFunc("/api/wlan_configs_5g", s.handleWlan5)
	mux.HandleFunc("/api/do_reboot", s.handleReboot)
	mux.HandleFunc("/api/lan_status", s.handleLanStatus)
	mux.HandleFunc("/api/sms", s.handleSmsList)
	mux.HandleFunc("/api/set_sms_state", s.handleSetSmsState)
	mux.HandleFunc("/api/delete_sms", s.handleDeleteSms)
	mux.HandleFunc("/api/cell_identification", s.handleCellIdentification)
	mux.HandleFunc("/api/led_status", s.handleLedStatus)
	mux.HandleFunc("/api/led_state", s.handleLedState)
	mux.HandleFunc("/api/config/listener_available", s.handleConfigListenerCheck)
	mux.HandleFunc("/api/config", s.handleConfig)
	mux.HandleFunc("/api/telegram/send", s.handleTelegramSend)
	mux.HandleFunc("/favicon.ico", s.handleFavicon)

	mux.Handle("/_next/", http.StripPrefix("/_next/", http.FileServer(webtpl.NextStatic())))
	mux.HandleFunc("/", s.handleNextApp)

	return corsMiddleware(mux)
}

func (s *Server) handleNextApp(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	requestPath := strings.Trim(r.URL.Path, "/")
	switch {
	case requestPath == "":
		requestPath = "index"
	case strings.HasSuffix(r.URL.Path, "/"):
		requestPath = strings.Trim(r.URL.Path, "/") + "/index"
	}
	requestPath = path.Clean(requestPath)
	requestPath = strings.TrimPrefix(requestPath, "../")

	data, err := webtpl.NextPage(requestPath)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			w.WriteHeader(http.StatusNotFound)
			if page404, perr := webtpl.NextPage("404"); perr == nil {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				_, _ = w.Write(page404)
			}
			return
		}
		s.logger.Printf("failed to render next page %q: %v", requestPath, err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if _, err := w.Write(data); err != nil {
		s.logger.Printf("failed to write next page %q: %v", requestPath, err)
	}
}

func (s *Server) handleFavicon(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	data, err := webtpl.NextFile("favicon.ico")
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			http.NotFound(w, r)
			return
		}
		s.logger.Printf("failed to load favicon: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "image/x-icon")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	if r.Method == http.MethodHead {
		return
	}

	if _, err := w.Write(data); err != nil {
		s.logger.Printf("failed to write favicon: %v", err)
	}
}

func (s *Server) handleDailyUsage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	settingsData := s.store.Get()
	totalUpload := int64(0)
	totalDownload := int64(0)
	for _, usage := range settingsData.DailyUsage {
		totalUpload += usage.Upload
		totalDownload += usage.Download
	}
	totalCombined := totalUpload + totalDownload

	dailyData := make([]map[string]interface{}, 0, len(settingsData.DailyUsage))
	for date, usage := range settingsData.DailyUsage {
		uploadPerc := percentage(usage.Upload, totalUpload)
		downloadPerc := percentage(usage.Download, totalDownload)
		combined := usage.Upload + usage.Download
		combinedPerc := percentage(combined, totalCombined)

		dailyData = append(dailyData, map[string]interface{}{
			"date": date,
			"upload": map[string]interface{}{
				"raw_bytes":  usage.Upload,
				"formatted":  formatBytes(usage.Upload),
				"percentage": uploadPerc,
			},
			"download": map[string]interface{}{
				"raw_bytes":  usage.Download,
				"formatted":  formatBytes(usage.Download),
				"percentage": downloadPerc,
			},
			"combined": map[string]interface{}{
				"raw_bytes":  combined,
				"formatted":  formatBytes(combined),
				"percentage": combinedPerc,
			},
		})
	}

	sort.Slice(dailyData, func(i, j int) bool {
		di := dailyData[i]["date"].(string)
		dj := dailyData[j]["date"].(string)
		return di > dj
	})

	last7 := make([]map[string]interface{}, 0, 7)
	for i := 0; i < len(dailyData) && i < 7; i++ {
		last7 = append(last7, dailyData[i])
	}

	response := map[string]interface{}{
		"daily_data": dailyData,
		"total_usage": map[string]string{
			"upload":   formatBytes(totalUpload),
			"download": formatBytes(totalDownload),
			"combined": formatBytes(totalCombined),
		},
		"last_7_days": last7,
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleGetDataExpired(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	data := s.store.Get()
	writeJSON(w, http.StatusOK, data.DataExpired)
}

func (s *Server) handleSetDataExpired(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	value := r.URL.Query().Get("data_expired")
	if strings.TrimSpace(value) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing 'data_expired' parameter"})
		return
	}
	timestamp, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid 'data_expired' value"})
		return
	}

	if err := s.store.SetDataExpired(timestamp); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":      "Data expiration saved",
		"data_expired": timestamp,
	})
}

func (s *Server) handlePreloginStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	client := s.getClient()
	data, err := client.GetPreloginStatus(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleOverview(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		client := s.getClient()
		return client.GetOverviewData(ctx, session)
	})
}

func (s *Server) handleWanStatus(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		client := s.getClient()
		return client.GetWanStatus(ctx, session)
	})
}

func (s *Server) handleDeviceStatus(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		client := s.getClient()
		return client.GetDeviceStatus(ctx, session)
	})
}

func (s *Server) handleNetworkClients(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		client := s.getClient()
		return client.GetNetworkClientStatus(ctx, session)
	})
}

func (s *Server) handleServiceData(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		client := s.getClient()
		return client.PostServiceData(ctx, session)
	})
}

func (s *Server) handleStatusWeb(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		client := s.getClient()
		data, err := client.GetStatusWeb(ctx, session)
		if err != nil {
			return nil, err
		}
		if err := s.store.UpdateUsageFromStatus(data); err != nil {
			s.logger.Printf("failed to update usage: %v", err)
		}
		return data, nil
	})
}

func (s *Server) handleSetAPN(w http.ResponseWriter, r *http.Request) {
	apn := r.URL.Query().Get("apn")
	if strings.TrimSpace(apn) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing 'apn' parameter"})
		return
	}

	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		client := s.getClient()
		return client.PostSetAPN(ctx, session, apn)
	})
}

func (s *Server) handleWlan24(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		client := s.getClient()
		return client.GetWlan24Configs(ctx, session)
	})
}

func (s *Server) handleWlan5(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		client := s.getClient()
		return client.GetWlan5Configs(ctx, session)
	})
}

func (s *Server) handleReboot(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		client := s.getClient()
		return client.Reboot(ctx, session)
	})
}

func (s *Server) handleLanStatus(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		client := s.getClient()
		return client.GetLanStatusWeb(ctx, session)
	})
}

func (s *Server) handleSmsList(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		client := s.getClient()
		return client.GetSmsList(ctx, session)
	})
}

func (s *Server) handleSetSmsState(w http.ResponseWriter, r *http.Request) {
	smsID := r.URL.Query().Get("smsid")
	smsUnread := r.URL.Query().Get("smsunread")
	if strings.TrimSpace(smsID) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing 'smsid' parameter"})
		return
	}
	if strings.TrimSpace(smsUnread) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing 'smsunread' parameter"})
		return
	}

	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		client := s.getClient()
		return client.SetSmsState(ctx, session, smsID, smsUnread)
	})
}

func (s *Server) handleTelegramSend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cfg := s.getConfig()
	if !cfg.Telegram.Enabled {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Telegram integration is disabled"})
		return
	}
	if strings.TrimSpace(cfg.Telegram.BotToken) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Telegram bot token is not configured"})
		return
	}

	var payload struct {
		Message   string `json:"message"`
		ChatID    string `json:"chat_id"`
		ParseMode string `json:"parse_mode"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	message := strings.TrimSpace(payload.Message)
	if message == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "message is required"})
		return
	}
	if len(message) > 4096 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "message exceeds Telegram 4096 character limit"})
		return
	}

	chatID := strings.TrimSpace(payload.ChatID)
	if chatID == "" {
		chatID = strings.TrimSpace(cfg.Telegram.ChatID)
	}
	if chatID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "chat_id is required"})
		return
	}

	parseMode := strings.TrimSpace(payload.ParseMode)
	if parseMode == "" {
		parseMode = strings.TrimSpace(cfg.Telegram.ParseMode)
	}
	if parseMode != "" && !isValidTelegramParseMode(parseMode) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid parse_mode"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	if err := s.sendTelegramMessage(ctx, cfg.Telegram, chatID, parseMode, message); err != nil {
		s.logger.Printf("telegram send failed: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "failed to send Telegram message"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "sent"})
}

func (s *Server) handleDeleteSms(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ids, deleteAll, err := extractSmsDeleteRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	if len(ids) == 0 && !deleteAll {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "No SMS IDs provided"})
		return
	}

	s.withSessionForMethods(w, r, []string{http.MethodPost}, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		client := s.getClient()
		return client.DeleteSms(ctx, session, ids, deleteAll)
	})
}

func (s *Server) handleCellIdentification(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		client := s.getClient()
		return client.PostCellularIdentification(ctx, session)
	})
}

func (s *Server) handleLedState(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
			return s.fetchNormalizedLedState(ctx, session)
		})
	case http.MethodPost:
		enableParam := strings.TrimSpace(r.URL.Query().Get("enable"))
		var enable bool
		var parsed bool
		if enableParam != "" {
			val, err := strconv.ParseBool(enableParam)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid 'enable' value"})
				return
			}
			enable = val
			parsed = true
		}
		if !parsed {
			var payload struct {
				Enable *bool `json:"enable"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
				return
			}
			if payload.Enable == nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "'enable' field required"})
				return
			}
			enable = *payload.Enable
		}

		client := s.getClient()
		session, loginResp, err := client.GetLogin(false)
		if err != nil {
			writeError(w, err)
			return
		}
		if session == nil {
			writeJSON(w, http.StatusOK, loginResp)
			return
		}

		result, err := client.LedState(r.Context(), session, enable)
		if err != nil {
			session, loginResp, err = client.GetLogin(true)
			if err != nil {
				writeError(w, err)
				return
			}
			if session == nil {
				writeJSON(w, http.StatusOK, loginResp)
				return
			}
			result, err = client.LedState(r.Context(), session, enable)
			if err != nil {
				writeError(w, err)
				return
			}
		}
		writeJSON(w, http.StatusOK, result)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleLedStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		return s.fetchNormalizedLedState(ctx, session)
	})
}

func (s *Server) fetchNormalizedLedState(ctx context.Context, session *router.LoginSession) (map[string]interface{}, error) {
	client := s.getClient()
	raw, err := client.GetLedState(ctx, session)
	if err != nil {
		return nil, err
	}
	return normalizeLedStateResponse(raw), nil
}

func normalizeLedStateResponse(raw map[string]interface{}) map[string]interface{} {
	statusLED := extractLedFlag(raw, "X_ALU_COM_StatusLED_Enable")
	signalLED := extractLedFlag(raw, "X_ALU_COM_SignalLED_Enable")

	return map[string]interface{}{
		"enabled":    statusLED && signalLED,
		"status_led": statusLED,
		"signal_led": signalLED,
	}
}

func extractLedFlag(raw map[string]interface{}, key string) bool {
	if raw == nil {
		return false
	}

	ledGlobal, ok := raw["LEDGlobalSts"]
	if !ok {
		return false
	}

	if data, ok := ledGlobal.(map[string]interface{}); ok {
		return parseTruthy(data[key])
	}
	return false
}

func parseTruthy(value interface{}) bool {
	switch v := value.(type) {
	case bool:
		return v
	case float64:
		return v != 0
	case int:
		return v != 0
	case int64:
		return v != 0
	case string:
		s := strings.TrimSpace(v)
		if s == "" {
			return false
		}

		switch strings.ToLower(s) {
		case "true", "on", "enabled", "enable", "yes":
			return true
		case "false", "off", "disabled", "disable", "no":
			return false
		}

		if num, err := strconv.Atoi(s); err == nil {
			return num != 0
		}
	case json.Number:
		if val, err := v.Int64(); err == nil {
			return val != 0
		}
	}
	return false
}

func (s *Server) withSession(w http.ResponseWriter, r *http.Request, fn func(context.Context, *router.LoginSession) (interface{}, error)) {
	s.withSessionForMethods(w, r, []string{http.MethodGet}, fn)
}

func (s *Server) withSessionForMethods(w http.ResponseWriter, r *http.Request, methods []string, fn func(context.Context, *router.LoginSession) (interface{}, error)) {
	allowed := slices.Contains(methods, r.Method)
	if !allowed {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	client := s.getClient()
	session, loginResp, err := client.GetLogin(false)
	if err != nil {
		writeError(w, err)
		return
	}
	if session == nil {
		writeJSON(w, http.StatusOK, loginResp)
		return
	}

	result, err := fn(r.Context(), session)
	if err != nil {
		client = s.getClient()
		session, loginResp, err = client.GetLogin(true)
		if err != nil {
			writeError(w, err)
			return
		}
		if session == nil {
			writeJSON(w, http.StatusOK, loginResp)
			return
		}
		result, err = fn(r.Context(), session)
		if err != nil {
			writeError(w, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleConfigListenerCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	host := strings.TrimSpace(r.URL.Query().Get("host"))
	port := strings.TrimSpace(r.URL.Query().Get("port"))

	candidate := s.getConfig()
	if host != "" {
		candidate.ListenHost = host
	}
	if port != "" {
		candidate.ListenPort = port
	}

	candidate = normalizeConfig(candidate)
	if err := validateConfig(candidate); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	if err := s.validateListener(candidate); err != nil {
		writeJSON(w, http.StatusConflict, map[string]interface{}{
			"available":   false,
			"error":       err.Error(),
			"listen_host": candidate.ListenHost,
			"listen_port": candidate.ListenPort,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"available":   true,
		"listen_host": candidate.ListenHost,
		"listen_port": candidate.ListenPort,
	})
}

func (s *Server) sendTelegramMessage(ctx context.Context, cfg config.TelegramConfig, chatID, parseMode, message string) error {
	base := strings.TrimSpace(cfg.APIBase)
	if base == "" {
		base = config.Defaults().Telegram.APIBase
	}
	base = strings.TrimRight(base, "/")
	endpoint := fmt.Sprintf("%s/bot%s/sendMessage", base, cfg.BotToken)

	payload := map[string]interface{}{
		"chat_id": chatID,
		"text":    message,
	}
	if strings.TrimSpace(parseMode) != "" {
		payload["parse_mode"] = parseMode
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode telegram payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create telegram request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("send telegram request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	return fmt.Errorf("telegram error: status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(respBody)))
}

func isValidTelegramParseMode(mode string) bool {
	switch strings.ToLower(mode) {
	case "markdown", "markdownv2", "html":
		return true
	default:
		return false
	}
}

func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, s.getConfig())
	case http.MethodPost:
		defer r.Body.Close()

		var payload config.Config
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
			return
		}

		updated := normalizeConfig(payload)
		if err := validateConfig(updated); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		if err := s.validateListener(updated); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		if err := config.Save(s.cfgPath, updated); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("save config: %v", err)})
			return
		}

		s.setConfig(updated)
		s.setClient(router.NewClient(updated))
		s.configureSmsForwarding(updated)
		s.logger.Printf("Configuration updated at %s", s.cfgPath)

		if s.reloadFn != nil {
			go s.reloadFn(updated)
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"message": "configuration updated",
			"config":  updated,
		})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func normalizeConfig(cfg config.Config) config.Config {
	defaults := config.Defaults()

	normalized := config.Config{
		RouterHost:     strings.TrimSpace(cfg.RouterHost),
		RouterUser:     strings.TrimSpace(cfg.RouterUser),
		RouterPassword: strings.TrimSpace(cfg.RouterPassword),
		ListenHost:     strings.TrimSpace(cfg.ListenHost),
		ListenPort:     strings.TrimSpace(cfg.ListenPort),
		PollIntervalMs: cfg.PollIntervalMs,
		Telegram: config.TelegramConfig{
			Enabled:   cfg.Telegram.Enabled,
			APIBase:   strings.TrimSpace(cfg.Telegram.APIBase),
			BotToken:  strings.TrimSpace(cfg.Telegram.BotToken),
			ChatID:    strings.TrimSpace(cfg.Telegram.ChatID),
			ParseMode: strings.TrimSpace(cfg.Telegram.ParseMode),
		},
		LongPolling: config.LongPollingConfig{
			Enabled:              cfg.LongPolling.Enabled,
			ForwardSmsToTelegram: cfg.LongPolling.ForwardSmsToTelegram,
			IntervalSeconds:      cfg.LongPolling.IntervalSeconds,
		},
	}

	if normalized.RouterHost == "" {
		normalized.RouterHost = defaults.RouterHost
	}
	if normalized.RouterUser == "" {
		normalized.RouterUser = defaults.RouterUser
	}
	if normalized.RouterPassword == "" {
		normalized.RouterPassword = defaults.RouterPassword
	}
	if normalized.ListenHost == "" {
		normalized.ListenHost = defaults.ListenHost
	}
	if normalized.ListenPort == "" {
		normalized.ListenPort = defaults.ListenPort
	}
	if normalized.PollIntervalMs <= 0 {
		normalized.PollIntervalMs = defaults.PollIntervalMs
	}
	if strings.TrimSpace(normalized.Telegram.APIBase) == "" {
		normalized.Telegram.APIBase = defaults.Telegram.APIBase
	}
	if normalized.LongPolling.IntervalSeconds < 5 {
		normalized.LongPolling.IntervalSeconds = defaults.LongPolling.IntervalSeconds
	}

	return normalized
}

func validateConfig(cfg config.Config) error {
	if cfg.RouterHost == "" {
		return errors.New("router_host is required")
	}
	if cfg.RouterUser == "" {
		return errors.New("router_user is required")
	}
	if cfg.RouterPassword == "" {
		return errors.New("router_password is required")
	}
	if cfg.ListenHost == "" {
		return errors.New("listen_host is required")
	}
	if cfg.ListenPort == "" {
		return errors.New("listen_port is required")
	}
	if cfg.PollIntervalMs < 500 {
		return errors.New("poll_interval_ms must be at least 500 milliseconds")
	}

	if _, err := strconv.Atoi(cfg.ListenPort); err != nil {
		return fmt.Errorf("listen_port must be numeric: %w", err)
	}

	if cfg.Telegram.Enabled {
		if cfg.Telegram.BotToken == "" {
			return errors.New("telegram.bot_token is required when Telegram integration is enabled")
		}
		if cfg.Telegram.ChatID == "" {
			return errors.New("telegram.chat_id is required when Telegram integration is enabled")
		}
		if cfg.Telegram.APIBase == "" {
			return errors.New("telegram.api_base is required when Telegram integration is enabled")
		}
		if _, err := url.ParseRequestURI(cfg.Telegram.APIBase); err != nil {
			return fmt.Errorf("invalid telegram.api_base: %w", err)
		}
		if strings.TrimSpace(cfg.Telegram.ParseMode) != "" && !isValidTelegramParseMode(cfg.Telegram.ParseMode) {
			return fmt.Errorf("invalid telegram.parse_mode: %s", cfg.Telegram.ParseMode)
		}
	}

	return nil
}

func (s *Server) validateListener(cfg config.Config) error {
	current := s.getConfig()
	if strings.EqualFold(strings.TrimSpace(cfg.ListenHost), strings.TrimSpace(current.ListenHost)) &&
		strings.TrimSpace(cfg.ListenPort) == strings.TrimSpace(current.ListenPort) {
		return nil
	}

	addr := net.JoinHostPort(cfg.ListenHost, cfg.ListenPort)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("listen address %s unavailable: %w", addr, err)
	}
	if err := listener.Close(); err != nil {
		return fmt.Errorf("listen address %s unable to close probe listener: %w", addr, err)
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Add("Server", "OpenWrt-23.05.5")
	w.Header().Add("GO", runtime.Version())
	w.WriteHeader(status)
	if payload == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("failed to encode json: %v", err)
	}
}

func writeError(w http.ResponseWriter, err error) {
	var status = http.StatusInternalServerError
	var msg = err.Error()
	if errors.Is(err, context.Canceled) {
		status = http.StatusRequestTimeout
		msg = "request cancelled"
	}
	writeJSON(w, status, map[string]string{"error": msg})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func splitAndCleanIDs(raw string) []string {
	if raw == "" {
		return nil
	}

	splitFn := func(r rune) bool {
		return r == ',' || r == ';' || r == '|' || unicode.IsSpace(r)
	}

	parts := strings.FieldsFunc(raw, splitFn)
	cleaned := make([]string, 0, len(parts))
	for _, part := range parts {
		id := strings.TrimSpace(part)
		if id != "" {
			cleaned = append(cleaned, id)
		}
	}
	return cleaned
}

func extractSmsDeleteRequest(r *http.Request) ([]string, bool, error) {
	var combined []string
	deleteAll := false

	if r.Body != nil {
		defer r.Body.Close()
		data, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			return nil, false, fmt.Errorf("read request body: %w", err)
		}

		trimmed := bytes.TrimSpace(data)
		if len(trimmed) > 0 {
			var payload struct {
				SMSIDs       []string `json:"sms_ids"`
				IDs          []string `json:"ids"`
				SMSID        string   `json:"sms_id"`
				SMSList      []string `json:"SMSList"`
				DeleteAll    bool     `json:"delete_all"`
				DeleteAllAlt bool     `json:"DeleteAll"`
			}
			if err := json.Unmarshal(trimmed, &payload); err != nil {
				return nil, false, fmt.Errorf("invalid JSON payload")
			}
			combined = append(combined, payload.SMSIDs...)
			combined = append(combined, payload.IDs...)
			if payload.SMSID != "" {
				combined = append(combined, payload.SMSID)
			}
			combined = append(combined, payload.SMSList...)
			deleteAll = payload.DeleteAll || payload.DeleteAllAlt
			if deleteAll {
				combined = combined[:0]
			}
		}
	}

	if queryIDs := splitAndCleanIDs(r.URL.Query().Get("smsid")); len(queryIDs) > 0 {
		combined = append(combined, queryIDs...)
	}
	if !deleteAll {
		if raw := strings.TrimSpace(r.URL.Query().Get("delete_all")); raw != "" {
			if val, err := strconv.ParseBool(raw); err == nil && val {
				deleteAll = true
				combined = combined[:0]
			}
		}
	}

	cleaned := make([]string, 0, len(combined))
	seen := make(map[string]struct{}, len(combined))
	for _, candidate := range combined {
		for _, id := range splitAndCleanIDs(candidate) {
			if id == "" {
				continue
			}
			if _, exists := seen[id]; exists {
				continue
			}
			seen[id] = struct{}{}
			cleaned = append(cleaned, id)
		}
	}

	return cleaned, deleteAll, nil
}

func formatBytes(b int64) string {
	const unit = 1024.0
	if b < 0 {
		b = 0
	}
	bytes := float64(b)
	units := []string{"B", "KB", "MB", "GB", "TB", "PB"}
	i := 0
	for bytes >= unit && i < len(units)-1 {
		bytes /= unit
		i++
	}
	return fmt.Sprintf("%.2f %s", bytes, units[i])
}

func percentage(part, total int64) float64 {
	if total <= 0 {
		return 0
	}
	return (float64(part) / float64(total)) * 100
}
