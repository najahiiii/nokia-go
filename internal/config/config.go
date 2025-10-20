package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
)

// Config holds application configuration values. All fields are optional;
// fallbacks are applied when fields are empty.
type Config struct {
	RouterHost     string `json:"router_host"`
	RouterUser     string `json:"router_user"`
	RouterPassword string `json:"router_password"`
	ListenHost     string `json:"listen_host"`
	ListenPort     string `json:"listen_port"`
}

// Defaults provides safe defaults when nothing else is configured.
func Defaults() Config {
	return Config{
		RouterHost:     "192.168.0.1",
		RouterUser:     "admin",
		RouterPassword: "6fa6e262c3",
		ListenHost:     "0.0.0.0",
		ListenPort:     "5000",
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
