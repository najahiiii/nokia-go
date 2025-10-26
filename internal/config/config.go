package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config holds application configuration values. All fields are optional;
// fallbacks are applied when fields are empty.
type Config struct {
	RouterHost     string            `json:"router_host"`
	RouterUser     string            `json:"router_user"`
	RouterPassword string            `json:"router_password"`
	ListenHost     string            `json:"listen_host"`
	ListenPort     string            `json:"listen_port"`
	PollIntervalMs int               `json:"poll_interval_ms"`
	Telegram       TelegramConfig    `json:"telegram"`
	LongPolling    LongPollingConfig `json:"long_polling"`
	MQTT           MQTTConfig        `json:"mqtt"`
}

type TelegramConfig struct {
	Enabled   bool   `json:"enabled"`
	APIBase   string `json:"api_base"`
	BotToken  string `json:"bot_token"`
	ChatID    string `json:"chat_id"`
	ParseMode string `json:"parse_mode"`
}

type LongPollingConfig struct {
	Enabled              bool `json:"enabled"`
	ForwardSmsToTelegram bool `json:"forward_sms_to_telegram"`
	IntervalSeconds      int  `json:"interval_seconds"`
}

type MQTTConfig struct {
	Enabled   bool   `json:"enabled"`
	Broker    string `json:"broker"`
	ClientID  string `json:"client_id"`
	Username  string `json:"username"`
	Password  string `json:"password"`
	TopicBase string `json:"topic_base"`
}

// Defaults provides safe defaults when nothing else is configured.
func Defaults() Config {
	return Config{
		RouterHost:     "192.168.0.1",
		RouterUser:     "admin",
		RouterPassword: "6fa6e262c3",
		ListenHost:     "0.0.0.0",
		ListenPort:     "5000",
		PollIntervalMs: 1000,
		Telegram: TelegramConfig{
			Enabled:   false,
			APIBase:   "https://api.telegram.org",
			BotToken:  "",
			ChatID:    "",
			ParseMode: "",
		},
		LongPolling: LongPollingConfig{
			Enabled:              false,
			ForwardSmsToTelegram: false,
			IntervalSeconds:      10,
		},
		MQTT: MQTTConfig{
			Enabled:   false,
			Broker:    "",
			ClientID:  "",
			Username:  "",
			Password:  "",
			TopicBase: "modem/nokia",
		},
	}
}

// Load reads configuration from a JSON file (if provided), then overrides
// with environment variables, and finally applies defaults when needed.
func Load(path string) (Config, error) {
	cfg := Defaults()

	if path != "" {
		if err := loadFromFile(path, &cfg); err != nil {
			if !errors.Is(err, os.ErrNotExist) {
				return Config{}, err
			}
		}
	}

	applyEnvOverrides(&cfg)
	ensureDefaults(&cfg)
	return cfg, nil
}

func loadFromFile(path string, cfg *Config) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	decoder := json.NewDecoder(file)
	if err := decoder.Decode(cfg); err != nil {
		return fmt.Errorf("decode config: %w", err)
	}
	return nil
}

func applyEnvOverrides(cfg *Config) {
	if v := strings.TrimSpace(os.Getenv("ROUTER_HOSTNAME")); v != "" {
		cfg.RouterHost = v
	}
	if v := strings.TrimSpace(os.Getenv("ROUTER_USERNAME")); v != "" {
		cfg.RouterUser = v
	}
	if v := strings.TrimSpace(os.Getenv("ROUTER_PASSWORD")); v != "" {
		cfg.RouterPassword = v
	}
	if v := strings.TrimSpace(os.Getenv("HOST")); v != "" {
		cfg.ListenHost = v
	}
	if v := strings.TrimSpace(os.Getenv("PORT")); v != "" {
		cfg.ListenPort = v
	}
	if v := strings.TrimSpace(os.Getenv("POLL_INTERVAL_MS")); v != "" {
		if ms, err := strconv.Atoi(v); err == nil {
			cfg.PollIntervalMs = ms
		}
	}
	if v := strings.TrimSpace(os.Getenv("TELEGRAM_ENABLED")); v != "" {
		cfg.Telegram.Enabled = parseBool(v, cfg.Telegram.Enabled)
	}
	if v := strings.TrimSpace(os.Getenv("TELEGRAM_API_BASE")); v != "" {
		cfg.Telegram.APIBase = v
	}
	if v := strings.TrimSpace(os.Getenv("TELEGRAM_BOT_TOKEN")); v != "" {
		cfg.Telegram.BotToken = v
	}
	if v := strings.TrimSpace(os.Getenv("TELEGRAM_CHAT_ID")); v != "" {
		cfg.Telegram.ChatID = v
	}
	if v := strings.TrimSpace(os.Getenv("TELEGRAM_PARSE_MODE")); v != "" {
		cfg.Telegram.ParseMode = v
	}
	if v := strings.TrimSpace(os.Getenv("LONG_POLLING_ENABLED")); v != "" {
		cfg.LongPolling.Enabled = parseBool(v, cfg.LongPolling.Enabled)
	}
	if v := strings.TrimSpace(os.Getenv("LONG_POLLING_FORWARD_SMS_TO_TELEGRAM")); v != "" {
		cfg.LongPolling.ForwardSmsToTelegram = parseBool(v, cfg.LongPolling.ForwardSmsToTelegram)
	}
	if v := strings.TrimSpace(os.Getenv("LONG_POLLING_INTERVAL_SECONDS")); v != "" {
		if seconds, err := strconv.Atoi(v); err == nil {
			cfg.LongPolling.IntervalSeconds = seconds
		}
	}
	if v := strings.TrimSpace(os.Getenv("MQTT_ENABLED")); v != "" {
		cfg.MQTT.Enabled = parseBool(v, cfg.MQTT.Enabled)
	}
	if v := strings.TrimSpace(os.Getenv("MQTT_BROKER")); v != "" {
		cfg.MQTT.Broker = v
	}
	if v := strings.TrimSpace(os.Getenv("MQTT_CLIENT_ID")); v != "" {
		cfg.MQTT.ClientID = v
	}
	if v := strings.TrimSpace(os.Getenv("MQTT_USERNAME")); v != "" {
		cfg.MQTT.Username = v
	}
	if v := strings.TrimSpace(os.Getenv("MQTT_PASSWORD")); v != "" {
		cfg.MQTT.Password = v
	}
	if v := strings.TrimSpace(os.Getenv("MQTT_TOPIC_BASE")); v != "" {
		cfg.MQTT.TopicBase = v
	}
}

func ensureDefaults(cfg *Config) {
	defaults := Defaults()

	if strings.TrimSpace(cfg.RouterHost) == "" {
		cfg.RouterHost = defaults.RouterHost
	}
	if strings.TrimSpace(cfg.RouterUser) == "" {
		cfg.RouterUser = defaults.RouterUser
	}
	if strings.TrimSpace(cfg.RouterPassword) == "" {
		cfg.RouterPassword = defaults.RouterPassword
	}
	if strings.TrimSpace(cfg.ListenHost) == "" {
		cfg.ListenHost = defaults.ListenHost
	}
	if strings.TrimSpace(cfg.ListenPort) == "" {
		cfg.ListenPort = defaults.ListenPort
	}
	if cfg.PollIntervalMs <= 0 {
		cfg.PollIntervalMs = defaults.PollIntervalMs
	}
	if strings.TrimSpace(cfg.Telegram.APIBase) == "" {
		cfg.Telegram.APIBase = defaults.Telegram.APIBase
	}
	if strings.TrimSpace(cfg.Telegram.ParseMode) == "" {
		cfg.Telegram.ParseMode = defaults.Telegram.ParseMode
	}
	if cfg.LongPolling.IntervalSeconds <= 0 {
		cfg.LongPolling.IntervalSeconds = defaults.LongPolling.IntervalSeconds
	}
	if strings.TrimSpace(cfg.MQTT.TopicBase) == "" {
		cfg.MQTT.TopicBase = defaults.MQTT.TopicBase
	}
}

func parseBool(value string, fallback bool) bool {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	switch trimmed {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	case "":
		return fallback
	default:
		if num, err := strconv.ParseFloat(trimmed, 64); err == nil {
			return num != 0
		}
		return fallback
	}
}

// Save writes the provided configuration to the given path.
func Save(path string, cfg Config) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	return encoder.Encode(cfg)
}
