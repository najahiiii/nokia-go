package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"runtime"
	"sort"
	"strconv"
	"strings"

	"nokia_router/internal/router"
	"nokia_router/internal/settings"
	webtpl "nokia_router/templates"
)

type Server struct {
	client *router.Client
	store  *settings.Store
	logger *log.Logger
}

func New(client *router.Client, store *settings.Store) *Server {
	return &Server{
		client: client,
		store:  store,
		logger: log.New(os.Stdout, "[server] ", log.LstdFlags),
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/", s.handleHome)
	mux.Handle("/script/", http.StripPrefix("/script/", http.FileServer(webtpl.Scripts())))
	mux.Handle("/assets/", http.StripPrefix("/assets/", http.FileServer(webtpl.Assets())))

	mux.HandleFunc("/api/daily_usage", s.handleDailyUsage)
	mux.HandleFunc("/api/get_data_expired", s.handleGetDataExpired)
	mux.HandleFunc("/api/set_data_expired", s.handleSetDataExpired)
	mux.HandleFunc("/api/prelogin_status", s.handlePreloginStatus)
	mux.HandleFunc("/api/overview", s.handleOverview)
	mux.HandleFunc("/api/wan_status", s.handleWanStatus)
	mux.HandleFunc("/api/device_status", s.handleDeviceStatus)
	mux.HandleFunc("/api/service_data", s.handleServiceData)
	mux.HandleFunc("/api/status_web", s.handleStatusWeb)
	mux.HandleFunc("/api/set_apn", s.handleSetAPN)
	mux.HandleFunc("/api/wlan_configs_24g", s.handleWlan24)
	mux.HandleFunc("/api/wlan_configs_5g", s.handleWlan5)
	mux.HandleFunc("/api/do_reboot", s.handleReboot)
	mux.HandleFunc("/api/lan_status", s.handleLanStatus)
	mux.HandleFunc("/api/sms", s.handleSmsList)
	mux.HandleFunc("/api/set_sms_state", s.handleSetSmsState)
	mux.HandleFunc("/api/cell_identification", s.handleCellIdentification)

	return corsMiddleware(mux)
}

func (s *Server) handleHome(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if _, err := w.Write(webtpl.Index()); err != nil {
		s.logger.Printf("failed to write index.html: %v", err)
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

	data, err := s.client.GetPreloginStatus(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleOverview(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		return s.client.GetOverviewData(ctx, session)
	})
}

func (s *Server) handleWanStatus(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		return s.client.GetWanStatus(ctx, session)
	})
}

func (s *Server) handleDeviceStatus(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		return s.client.GetDeviceStatus(ctx, session)
	})
}

func (s *Server) handleServiceData(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		return s.client.PostServiceData(ctx, session)
	})
}

func (s *Server) handleStatusWeb(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		data, err := s.client.GetStatusWeb(ctx, session)
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
		return s.client.PostSetAPN(ctx, session, apn)
	})
}

func (s *Server) handleWlan24(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		return s.client.GetWlan24Configs(ctx, session)
	})
}

func (s *Server) handleWlan5(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		return s.client.GetWlan5Configs(ctx, session)
	})
}

func (s *Server) handleReboot(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		return s.client.Reboot(ctx, session)
	})
}

func (s *Server) handleLanStatus(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		return s.client.GetLanStatusWeb(ctx, session)
	})
}

func (s *Server) handleSmsList(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		return s.client.GetSmsList(ctx, session)
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
		return s.client.SetSmsState(ctx, session, smsID, smsUnread)
	})
}

func (s *Server) handleCellIdentification(w http.ResponseWriter, r *http.Request) {
	s.withSession(w, r, func(ctx context.Context, session *router.LoginSession) (interface{}, error) {
		return s.client.PostCellularIdentification(ctx, session)
	})
}

func (s *Server) withSession(w http.ResponseWriter, r *http.Request, fn func(context.Context, *router.LoginSession) (interface{}, error)) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	session, loginResp, err := s.client.GetLogin(false)
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
		session, loginResp, err = s.client.GetLogin(true)
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
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
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
