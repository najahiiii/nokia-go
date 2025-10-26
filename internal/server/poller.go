package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"nokia_modem/internal/config"
)

type smsMessage struct {
	SMSID       string    `json:"SMSID"`
	SMSContent  string    `json:"SMSContent"`
	SMSDateTime string    `json:"SMSDateTime"`
	SMSUnread   bool      `json:"SMSUnread"`
	SMSSender   string    `json:"SMSSender"`
	parsedTime  time.Time `json:"-"`
}

type smsArchiveFile struct {
	LastUpdated time.Time    `json:"last_updated"`
	Messages    []smsMessage `json:"messages"`
}

type smsArchive struct {
	path    string
	mu      sync.Mutex
	loaded  bool
	entries map[string]smsMessage
}

func newSmsArchive(path string) *smsArchive {
	return &smsArchive{
		path:    path,
		entries: map[string]smsMessage{},
	}
}

func (a *smsArchive) ensureLoadedLocked() error {
	if a.loaded {
		return nil
	}
	defer func() {
		a.loaded = true
	}()

	data, err := os.ReadFile(a.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}

	var file smsArchiveFile
	if err := json.Unmarshal(data, &file); err != nil {
		return err
	}

	for _, msg := range file.Messages {
		if strings.TrimSpace(msg.SMSID) == "" {
			continue
		}
		a.entries[msg.SMSID] = msg
	}
	return nil
}

func (a *smsArchive) Update(messages []smsMessage) ([]smsMessage, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if err := a.ensureLoadedLocked(); err != nil {
		return nil, fmt.Errorf("load sms archive: %w", err)
	}

	newMessages := make([]smsMessage, 0)
	newEntries := make(map[string]smsMessage, len(messages))

	for _, msg := range messages {
		if strings.TrimSpace(msg.SMSID) == "" {
			continue
		}
		if _, exists := a.entries[msg.SMSID]; !exists {
			newMessages = append(newMessages, msg)
		}
		newEntries[msg.SMSID] = msg
	}

	a.entries = newEntries

	file := smsArchiveFile{
		LastUpdated: time.Now().UTC(),
		Messages:    make([]smsMessage, 0, len(messages)),
	}
	file.Messages = append(file.Messages, messages...)

	if err := a.saveLocked(file); err != nil {
		return nil, fmt.Errorf("save sms archive: %w", err)
	}

	return newMessages, nil
}

func (a *smsArchive) saveLocked(file smsArchiveFile) error {
	dir := filepath.Dir(a.path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(a.path, data, 0o644)
}

func (a *smsArchive) snapshotIDs() (map[string]struct{}, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if err := a.ensureLoadedLocked(); err != nil {
		return nil, err
	}

	ids := make(map[string]struct{}, len(a.entries))
	for id := range a.entries {
		ids[id] = struct{}{}
	}
	return ids, nil
}

func (s *Server) configureSmsForwarding(cfg config.Config) {
	shouldStart := cfg.LongPolling.Enabled && (cfg.LongPolling.ForwardSmsToTelegram || cfg.MQTT.Enabled)

	var (
		start bool
		stop  context.CancelFunc
		ctx   context.Context
	)

	s.pollerMu.Lock()
	active := s.smsForwardingActive

	if shouldStart && !active {
		ctx, s.pollerCancel = context.WithCancel(context.Background())
		s.smsForwardingActive = true
		s.pollerWG.Add(1)
		start = true
	}

	if !shouldStart && active {
		stop = s.pollerCancel
		s.pollerCancel = nil
		s.smsForwardingActive = false
	}
	s.pollerMu.Unlock()

	if stop != nil {
		stop()
		s.pollerWG.Wait()
		s.logger.Printf("SMS poller stopped")
	}

	if start {
		go s.runSmsPoller(ctx)
		s.logger.Printf("SMS poller started (interval %s)", s.nextSmsInterval())
	}

	s.configureMqtt(cfg)
}

func (s *Server) runSmsPoller(ctx context.Context) {
	defer s.pollerWG.Done()

	interval := s.nextSmsInterval()
	if interval <= 0 {
		interval = 10 * time.Second
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	s.performSmsSync(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.performSmsSync(ctx)
			next := s.nextSmsInterval()
			if next > 0 && next != interval {
				interval = next
				ticker.Reset(interval)
			}
		}
	}
}

func (s *Server) nextSmsInterval() time.Duration {
	cfg := s.getConfig()
	seconds := cfg.LongPolling.IntervalSeconds
	if seconds < 5 {
		seconds = 10
	}
	return time.Duration(seconds) * time.Second
}

func (s *Server) performSmsSync(ctx context.Context) {
	if ctx.Err() != nil {
		return
	}

	pollCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	messages, err := s.fetchSmsMessages(pollCtx)
	if err != nil {
		s.logger.Printf("poller: fetch failed: %v", err)
		return
	}

	existingIDs, err := s.smsArchive.snapshotIDs()
	if err != nil {
		s.logger.Printf("poller: snapshot archive failed: %v", err)
		existingIDs = map[string]struct{}{}
	}

	newMessages, err := s.smsArchive.Update(messages)
	if err != nil {
		s.logger.Printf("poller: persist failed: %v", err)
		return
	}

	cfg := s.getConfig()
	s.mqttMu.Lock()
	mqttClient := s.mqttClient
	s.mqttMu.Unlock()
	mqttConnected := mqttClient != nil && mqttClient.IsConnected()
	mqttReady := cfg.MQTT.Enabled && cfg.LongPolling.Enabled && mqttConnected
	now := time.Now().UTC()
	statusPayload := map[string]interface{}{
		"polled_at":          now.Format(time.RFC3339),
		"total_messages":     len(messages),
		"new_messages":       len(newMessages),
		"interval_seconds":   cfg.LongPolling.IntervalSeconds,
		"server_polling_on":  cfg.LongPolling.Enabled,
		"mqtt_enabled":       cfg.LongPolling.Enabled && cfg.MQTT.Enabled,
		"mqtt_connected":     mqttConnected,
		"mqtt_ready":         mqttReady,
		"telegram_forwarded": cfg.LongPolling.ForwardSmsToTelegram && cfg.Telegram.Enabled,
	}
	if mqttReady {
		s.publishMqttSafe("status", statusPayload)

		settingsSnapshot := s.store.Get()
		dailyPayload := buildDailyUsageSnapshot(settingsSnapshot)
		dailyPayload["polled_at"] = now.Format(time.RFC3339)
		dailyPayload["source"] = "poller"
		s.publishMqttSafe("daily_usage", dailyPayload)

		s.publishMqttSafe("data_expired", map[string]interface{}{
			"polled_at":    now.Format(time.RFC3339),
			"data_expired": settingsSnapshot.DataExpired,
			"source":       "poller",
		})

		statusCtx, statusCancel := context.WithTimeout(ctx, 10*time.Second)
		statusWeb, err := s.fetchStatusWeb(statusCtx)
		statusCancel()
		if err != nil {
			s.logger.Printf("poller: status_web fetch failed: %v", err)
		} else {
			if updateErr := s.store.UpdateUsageFromStatus(statusWeb); updateErr != nil {
				s.logger.Printf("poller: update usage from status failed: %v", updateErr)
			}
			s.publishMqttSafe("status_web", map[string]interface{}{
				"polled_at": now.Format(time.RFC3339),
				"data":      statusWeb,
				"source":    "poller",
			})
		}

		serviceCtx, serviceCancel := context.WithTimeout(ctx, 10*time.Second)
		serviceData, err := s.fetchServiceData(serviceCtx)
		serviceCancel()
		if err != nil {
			s.logger.Printf("poller: service_data fetch failed: %v", err)
		} else {
			s.publishMqttSafe("service_data", map[string]interface{}{
				"polled_at": now.Format(time.RFC3339),
				"data":      serviceData,
				"source":    "poller",
			})
		}

		preCtx, preCancel := context.WithTimeout(ctx, 10*time.Second)
		preStatus, err := s.getClient().GetPreloginStatus(preCtx)
		preCancel()
		if err != nil {
			s.logger.Printf("poller: prelogin fetch failed: %v", err)
		} else {
			s.publishMqttSafe("prelogin_status", map[string]interface{}{
				"polled_at": now.Format(time.RFC3339),
				"data":      preStatus,
				"source":    "poller",
			})
		}
	}

	if len(newMessages) == 0 {
		return
	}

	telegramEnabled := cfg.Telegram.Enabled && cfg.LongPolling.ForwardSmsToTelegram
	chatID := ""
	parseMode := strings.TrimSpace(cfg.Telegram.ParseMode)
	if telegramEnabled {
		chatID = strings.TrimSpace(cfg.Telegram.ChatID)
		if chatID == "" {
			s.logger.Printf("poller: telegram chat id missing")
			telegramEnabled = false
		}
	}

	publishTime := now.Format(time.RFC3339)
	for _, msg := range newMessages {
		if _, exists := existingIDs[msg.SMSID]; exists {
			continue
		}

		payload := map[string]interface{}{
			"id":            msg.SMSID,
			"sender":        strings.TrimSpace(msg.SMSSender),
			"content":       msg.SMSContent,
			"timestamp":     msg.SMSDateTime,
			"display_time":  formatSmsDisplayTime(msg),
			"unread":        msg.SMSUnread,
			"received_at":   publishTime,
			"poll_interval": cfg.LongPolling.IntervalSeconds,
		}
		if mqttReady {
			s.publishMqttSafe("sms", payload)
		}

		if !telegramEnabled {
			continue
		}

		messageText, resolvedParseMode := formatSmsForTelegram(msg, parseMode)

		sendCtx, sendCancel := context.WithTimeout(ctx, 15*time.Second)
		err := s.sendTelegramMessage(sendCtx, cfg.Telegram, chatID, resolvedParseMode, messageText)
		sendCancel()
		if err != nil {
			s.logger.Printf("poller: telegram send failed for SMS %s: %v", msg.SMSID, err)
			continue
		}
		s.logger.Printf("poller: forwarded SMS %s to Telegram", msg.SMSID)
	}
}

func (s *Server) fetchSmsMessages(ctx context.Context) ([]smsMessage, error) {
	client := s.getClient()
	session, _, err := client.GetLogin(false)
	if err != nil {
		return nil, fmt.Errorf("login: %w", err)
	}
	if session == nil {
		return nil, errors.New("login failed: no session")
	}

	payload, err := client.GetSmsList(ctx, session)
	if err != nil {
		session, _, relogErr := client.GetLogin(true)
		if relogErr != nil {
			return nil, fmt.Errorf("sms list: relogin failed: %w", relogErr)
		}
		if session == nil {
			return nil, errors.New("sms list: relogin failed: no session")
		}
		payload, err = client.GetSmsList(ctx, session)
		if err != nil {
			return nil, fmt.Errorf("sms list: %w", err)
		}
	}

	return normalizeSmsMessages(payload), nil
}

func (s *Server) fetchStatusWeb(ctx context.Context) (map[string]interface{}, error) {
	client := s.getClient()
	session, _, err := client.GetLogin(false)
	if err != nil {
		return nil, fmt.Errorf("login: %w", err)
	}
	if session == nil {
		return nil, errors.New("status_web: no session")
	}

	data, err := client.GetStatusWeb(ctx, session)
	if err != nil {
		session, _, relogErr := client.GetLogin(true)
		if relogErr != nil {
			return nil, fmt.Errorf("status_web: relogin failed: %w", relogErr)
		}
		if session == nil {
			return nil, errors.New("status_web: relogin failed: no session")
		}
		data, err = client.GetStatusWeb(ctx, session)
		if err != nil {
			return nil, fmt.Errorf("status_web: %w", err)
		}
	}
	return data, nil
}

func (s *Server) fetchServiceData(ctx context.Context) (map[string]interface{}, error) {
	client := s.getClient()
	session, _, err := client.GetLogin(false)
	if err != nil {
		return nil, fmt.Errorf("login: %w", err)
	}
	if session == nil {
		return nil, errors.New("service_data: no session")
	}

	data, err := client.PostServiceData(ctx, session)
	if err != nil {
		session, _, relogErr := client.GetLogin(true)
		if relogErr != nil {
			return nil, fmt.Errorf("service_data: relogin failed: %w", relogErr)
		}
		if session == nil {
			return nil, errors.New("service_data: relogin failed: no session")
		}
		data, err = client.PostServiceData(ctx, session)
		if err != nil {
			return nil, fmt.Errorf("service_data: %w", err)
		}
	}
	return data, nil
}

func normalizeSmsMessages(raw interface{}) []smsMessage {
	items := extractSmsItems(raw)
	if len(items) == 0 {
		return []smsMessage{}
	}

	messages := make([]smsMessage, 0, len(items))
	for _, item := range items {
		msg := smsMessage{
			SMSID:       firstString(item, "SMSID", "smsid", "id"),
			SMSContent:  firstString(item, "SMSContent", "sms_content", "Body", "body"),
			SMSDateTime: firstString(item, "SMSDateTime", "sms_datetime", "Timestamp", "timestamp"),
			SMSSender:   firstString(item, "SMSSender", "sms_sender", "From", "from"),
			SMSUnread:   true,
		}

		if candidate, ok := firstValue(item, "SMSUnread", "sms_unread", "Unread", "unread"); ok {
			msg.SMSUnread = toBool(candidate, true)
		} else if candidate, ok := item["Read"]; ok {
			msg.SMSUnread = !toBool(candidate, false)
		}

		if msg.SMSID == "" {
			continue
		}

		msg.parsedTime = parseSmsTime(msg.SMSDateTime)
		messages = append(messages, msg)
	}

	sort.SliceStable(messages, func(i, j int) bool {
		ai := messages[i].parsedTime
		aj := messages[j].parsedTime
		switch {
		case ai.IsZero() && aj.IsZero():
			return messages[i].SMSID > messages[j].SMSID
		case ai.IsZero():
			return false
		case aj.IsZero():
			return true
		default:
			return ai.After(aj)
		}
	})

	return messages
}

func extractSmsItems(raw interface{}) []map[string]interface{} {
	switch v := raw.(type) {
	case map[string]interface{}:
		if list := extractSmsItems(v["FunctionResult"]); len(list) > 0 {
			return list
		}
		if list := extractSmsItems(v["SMSList"]); len(list) > 0 {
			return list
		}
		if list := extractSmsItems(v["sms_list"]); len(list) > 0 {
			return list
		}
		if nested, ok := v["Data"]; ok {
			if list := extractSmsItems(nested); len(list) > 0 {
				return list
			}
		}
		if nested, ok := v["data"]; ok {
			if list := extractSmsItems(nested); len(list) > 0 {
				return list
			}
		}
		return nil
	case []interface{}:
		result := make([]map[string]interface{}, 0, len(v))
		for _, item := range v {
			if m, ok := item.(map[string]interface{}); ok {
				result = append(result, m)
			}
		}
		return result
	default:
		return nil
	}
}

func firstString(item map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		if val, ok := item[key]; ok {
			if s := toString(val); s != "" {
				return s
			}
		}
	}
	return ""
}

func firstValue(item map[string]interface{}, keys ...string) (interface{}, bool) {
	for _, key := range keys {
		if val, ok := item[key]; ok {
			return val, true
		}
	}
	return nil, false
}

func toString(value interface{}) string {
	if value == nil {
		return ""
	}

	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case json.Number:
		return strings.TrimSpace(v.String())
	case fmt.Stringer:
		return strings.TrimSpace(v.String())
	case float64, float32, int, int64, int32, int16, int8, uint, uint64, uint32, uint16, uint8:
		return strings.TrimSpace(fmt.Sprintf("%v", v))
	case bool:
		if v {
			return "true"
		}
		return "false"
	default:
		return ""
	}
}

func toBool(value interface{}, fallback bool) bool {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		switch strings.ToLower(strings.TrimSpace(v)) {
		case "1", "true", "yes", "on":
			return true
		case "0", "false", "no", "off":
			return false
		default:
			return fallback
		}
	case float64:
		return v != 0
	case float32:
		return v != 0
	case int:
		return v != 0
	case int32:
		return v != 0
	case int64:
		return v != 0
	case uint:
		return v != 0
	case uint8:
		return v != 0
	case uint16:
		return v != 0
	case uint32:
		return v != 0
	case uint64:
		return v != 0
	case json.Number:
		if val, err := v.Int64(); err == nil {
			return val != 0
		}
	}
	return fallback
}

func parseSmsTime(value string) time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}
	}

	layouts := []string{
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
		"2006/01/02 15:04:05",
	}
	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed
		}
	}
	return time.Time{}
}

func formatSmsForTelegram(msg smsMessage, parseMode string) (string, string) {
	sender := strings.TrimSpace(msg.SMSSender)
	if sender == "" {
		sender = "Unknown sender"
	}

	content := strings.TrimSpace(msg.SMSContent)
	if content == "" {
		content = "(empty message)"
	}

	displayTime := formatSmsDisplayTime(msg)

	mode := strings.TrimSpace(parseMode)
	switch strings.ToLower(mode) {
	case "markdown":
		return formatSmsMarkdown(sender, displayTime, content), "Markdown"
	case "markdownv2":
		return formatSmsMarkdownV2(sender, displayTime, content), "MarkdownV2"
	case "html":
		return formatSmsHTML(sender, displayTime, content), "HTML"
	default:
		return formatSmsPlain(sender, displayTime, content), ""
	}
}

func formatSmsDisplayTime(msg smsMessage) string {
	if !msg.parsedTime.IsZero() {
		return msg.parsedTime.Format("15:04 02/01/2006")
	}
	if parsed := parseSmsTime(msg.SMSDateTime); !parsed.IsZero() {
		return parsed.Format("15:04 02/01/2006")
	}
	trimmed := strings.TrimSpace(msg.SMSDateTime)
	if trimmed != "" {
		return trimmed
	}
	return "Unknown time"
}

var markdownEscape = strings.NewReplacer(
	"\\", "\\\\",
	"`", "\\`",
	"*", "\\*",
	"_", "\\_",
	"{", "\\{",
	"}", "\\}",
	"[", "\\[",
	"]", "\\]",
	"(", "\\(",
	")", "\\)",
	"#", "\\#",
	"+", "\\+",
	"-", "\\-",
	".", "\\.",
	"!", "\\!",
	">", "\\>",
	"~", "\\~",
	"|", "\\|",
	"=", "\\=",
)

var markdownV2Escape = strings.NewReplacer(
	"\\", "\\\\",
	"_", "\\_",
	"*", "\\*",
	"[", "\\[",
	"]", "\\]",
	"(", "\\(",
	")", "\\)",
	"~", "\\~",
	"`", "\\`",
	">", "\\>",
	"#", "\\#",
	"+", "\\+",
	"-", "\\-",
	"=", "\\=",
	"|", "\\|",
	"{", "\\{",
	"}", "\\}",
	".", "\\.",
	"!", "\\!",
)

func formatSmsMarkdown(sender, timestamp, content string) string {
	boldSender := "*" + markdownEscape.Replace(sender) + "*"
	body := markdownEscape.Replace(content)
	timeLine := "_" + markdownV2Escape.Replace(timestamp) + "_"
	return fmt.Sprintf("%s\n%s\n\n%s", boldSender, body, timeLine)
}

func formatSmsMarkdownV2(sender, timestamp, content string) string {
	boldSender := "*" + markdownV2Escape.Replace(sender) + "*"
	body := markdownV2Escape.Replace(content)
	timeLine := "_" + markdownV2Escape.Replace(timestamp) + "_"
	return fmt.Sprintf("%s\n%s\n\n%s", boldSender, body, timeLine)
}

func formatSmsHTML(sender, timestamp, content string) string {
	boldSender := "<b>" + html.EscapeString(sender) + "</b>"
	timeLine := html.EscapeString(timestamp)
	body := html.EscapeString(content)
	return fmt.Sprintf("%s<br><i>%s</i><br><br>%s", boldSender, body, timeLine)
}

func formatSmsPlain(sender, timestamp, content string) string {
	return fmt.Sprintf("%s\n%s\n\n%s", sender, content, timestamp)
}
