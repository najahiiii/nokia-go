package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"
	"time"

	"nokia_router/internal/config"
	"nokia_router/internal/router"
	"nokia_router/internal/server"
	"nokia_router/internal/settings"
)

var appVersion = "dev"

// gitCommit and gitDirty are injected at build time via -ldflags
var gitCommit = ""
var gitDirty = ""

func init() {
	baseVersion := strings.TrimSpace(appVersion)
	if baseVersion == "" || baseVersion == "dev" {
		if fallback := defaultVersion(); fallback != "" && fallback != "dev" {
			baseVersion = fallback
		}
	}

	hash := strings.TrimSpace(gitCommit)
	if hash == "" {
		hash = "unknown"
	}

	dirtySuffix := ""
	if strings.EqualFold(strings.TrimSpace(gitDirty), "true") {
		dirtySuffix = "-dirty"
	}

	appVersion = fmt.Sprintf("nokia-%s-%s%s", baseVersion, hash, dirtySuffix)
}

func main() {
	if len(os.Args) < 2 {
		printUsage()
		return
	}

	cmd := os.Args[1]
	args := os.Args[2:]

	switch cmd {
	case "run":
		if err := runCommand(args); err != nil {
			log.Fatalf("run: %v", err)
		}
	case "setup":
		if err := setupCommand(args); err != nil {
			log.Fatalf("setup: %v", err)
		}
	case "version", "-v", "--version":
		fmt.Println(appVersion)
	case "help", "-h", "--help":
		printUsage()
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n", cmd)
		printUsage()
		os.Exit(1)
	}
}

func runCommand(args []string) error {
	defaultPath, err := defaultConfigPath()
	if err != nil {
		return err
	}

	fs := flag.NewFlagSet("run", flag.ExitOnError)
	cfgPath := fs.String("config", defaultPath, "path to configuration file")
	if err := fs.Parse(args); err != nil {
		return err
	}

	logger := log.New(os.Stdout, "[nokia-router] ", log.LstdFlags)

	if err := ensureConfigFile(*cfgPath, logger); err != nil {
		return fmt.Errorf("prepare config: %w", err)
	}

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	settingsPath := filepath.Join(filepath.Dir(*cfgPath), "settings.json")
	store, err := settings.NewStore(settingsPath)
	if err != nil {
		return fmt.Errorf("load settings: %w", err)
	}

	client := router.NewClient(cfg)

	reloadCh := make(chan config.Config, 1)
	srv := server.New(client, store, *cfgPath, cfg, func(updated config.Config) {
		select {
		case reloadCh <- updated:
		default:
			select {
			case <-reloadCh:
			default:
			}
			reloadCh <- updated
		}
	})

	handler := srv.Handler()
	currentCfg := srv.Config()

	for {
		addr := net.JoinHostPort(currentCfg.ListenHost, currentCfg.ListenPort)
		httpServer := &http.Server{
			Addr:    addr,
			Handler: handler,
		}

		errCh := make(chan error, 1)
		go func() {
			errCh <- httpServer.ListenAndServe()
		}()

		logger.Printf("Starting server on %s", addr)
		restartRequested := false

	serverLoop:
		for {
			select {
			case err := <-errCh:
				if err != nil && !errors.Is(err, http.ErrServerClosed) {
					return fmt.Errorf("listen: %w", err)
				}
				if restartRequested {
					restartRequested = false
					break serverLoop
				}
				return nil
			case updatedCfg := <-reloadCh:
				currentCfg = updatedCfg
				restartRequested = true
				logger.Printf("Configuration changed, reloading server...")
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				if err := httpServer.Shutdown(ctx); err != nil && !errors.Is(err, http.ErrServerClosed) {
					cancel()
					return fmt.Errorf("shutdown: %w", err)
				}
				cancel()
			}
		}
	}
}

func setupCommand(args []string) error {
	defaultPath, err := defaultConfigPath()
	if err != nil {
		return err
	}

	fs := flag.NewFlagSet("setup", flag.ExitOnError)
	cfgPath := fs.String("config", defaultPath, "path to configuration file")
	if err := fs.Parse(args); err != nil {
		return err
	}

	logger := log.New(os.Stdout, "[nokia-router] ", log.LstdFlags)
	if err := ensureConfigFile(*cfgPath, logger); err != nil {
		return err
	}
	logger.Printf("Configuration ready at %s", *cfgPath)
	return nil
}

func defaultConfigPath() (string, error) {
	if home := strings.TrimSpace(os.Getenv("HOME")); home != "" {
		return filepath.Join(home, ".config", "nokia", "config.json"), nil
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("determine home directory: %w", err)
	}
	return filepath.Join(homeDir, ".config", "nokia", "config.json"), nil
}

func printUsage() {
	fmt.Println("Usage: nokia-router <command> [options]")
	fmt.Println()
	fmt.Println("Commands:")
	fmt.Println("  run     Start the web server")
	fmt.Println("  setup   Generate default configuration and exit")
	fmt.Println("  version Show program version")
	fmt.Println()
	fmt.Println("Global options:")
	fmt.Println("  -config <path>  Override configuration file path")
}

func defaultVersion() string {
	if info, ok := debug.ReadBuildInfo(); ok {
		if v := strings.TrimSpace(info.Main.Version); v != "" && v != "(devel)" {
			return v
		}
	}
	return "dev"
}

func ensureConfigFile(path string, logger *log.Logger) error {
	if strings.TrimSpace(path) == "" {
		return errors.New("empty config path")
	}

	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return err
		}
		if err := config.Save(path, config.Defaults()); err != nil {
			return err
		}
		if logger != nil {
			logger.Printf("Created default config at %s", path)
		}
		return nil
	} else if err != nil {
		return err
	}
	return nil
}
