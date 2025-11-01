package settings

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const resetGracePeriod = 5 * time.Minute

type UsageStats struct {
	Upload   int64 `json:"upload"`
	Download int64 `json:"download"`
	Total    int64 `json:"total"`
}

type LastStats struct {
	Upload   int64 `json:"upload"`
	Download int64 `json:"download"`
	Total    int64 `json:"total"`
}

type ResetTracker struct {
	Upload     int64 `json:"upload"`
	Download   int64 `json:"download"`
	ObservedAt int64 `json:"observed_at"`
	Active     bool  `json:"active"`
}

type Settings struct {
	DataExpired  int64                 `json:"data_expired"`
	DailyUsage   map[string]UsageStats `json:"daily_usage"`
	LastStats    LastStats             `json:"last_stats"`
	PendingReset ResetTracker          `json:"pending_reset"`
}

type Store struct {
	path string
	mu   sync.Mutex
	data Settings
}

func NewStore(path string) (*Store, error) {
	store := &Store{
		path: path,
		data: defaultSettings(),
	}
	if err := store.load(); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			if err := store.save(); err != nil {
				return nil, err
			}
		} else {
			return nil, err
		}
	}
	return store, nil
}

func defaultSettings() Settings {
	return Settings{
		DataExpired: 0,
		DailyUsage:  map[string]UsageStats{},
		LastStats: LastStats{
			Upload:   0,
			Download: 0,
			Total:    0,
		},
		PendingReset: ResetTracker{},
	}
}

func (s *Store) load() error {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return err
	}

	if len(bytes.TrimSpace(data)) == 0 {
		return s.recoverCorruptFile(io.EOF)
	}

	var settingsData Settings
	if err := json.Unmarshal(data, &settingsData); err != nil {
		if isRecoverableSettingsError(err) {
			return s.recoverCorruptFile(err)
		}
		return err
	}

	if settingsData.DailyUsage == nil {
		settingsData.DailyUsage = map[string]UsageStats{}
	}
	s.data = settingsData
	return nil
}

func (s *Store) save() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}

	dir := filepath.Dir(s.path)
	tmpFile, err := os.CreateTemp(dir, "settings-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmpFile.Name()

	encoder := json.NewEncoder(tmpFile)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(s.data); err != nil {
		_ = tmpFile.Close()
		_ = os.Remove(tmpName)
		return err
	}

	if err := tmpFile.Sync(); err != nil {
		_ = tmpFile.Close()
		_ = os.Remove(tmpName)
		return err
	}

	if err := tmpFile.Close(); err != nil {
		_ = os.Remove(tmpName)
		return err
	}

	if err := os.Rename(tmpName, s.path); err != nil {
		_ = os.Remove(tmpName)
		return err
	}

	if err := os.Chmod(s.path, 0o644); err != nil {
		return err
	}

	dirHandle, err := os.Open(dir)
	if err != nil {
		return nil
	}
	defer dirHandle.Close()
	_ = dirHandle.Sync()
	return nil
}

func (s *Store) Get() Settings {
	s.mu.Lock()
	defer s.mu.Unlock()
	return copySettings(s.data)
}

func copySettings(src Settings) Settings {
	copyUsage := make(map[string]UsageStats, len(src.DailyUsage))
	for k, v := range src.DailyUsage {
		copyUsage[k] = v
	}
	return Settings{
		DataExpired:  src.DataExpired,
		DailyUsage:   copyUsage,
		LastStats:    src.LastStats,
		PendingReset: src.PendingReset,
	}
}

func (s *Store) Update(fn func(*Settings) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := fn(&s.data); err != nil {
		return err
	}
	return s.save()
}

func (s *Store) SetDataExpired(timestamp int64) error {
	return s.Update(func(settings *Settings) error {
		settings.DataExpired = timestamp
		return nil
	})
}

func (s *Store) UpdateUsageFromStatus(status map[string]interface{}) error {
	return s.Update(func(settings *Settings) error {
		statEntry, err := resolveStatEntry(status)
		if err != nil {
			// if we cannot resolve stats, skip update but do not treat as fatal
			return nil
		}

		currentUpload := toInt64(statEntry["BytesSent"])
		currentDownload := toInt64(statEntry["BytesReceived"])
		currentTotal := currentUpload + currentDownload
		now := time.Now()
		currentDate := now.Format("2006-01-02")

		lastUpload := settings.LastStats.Upload
		lastDownload := settings.LastStats.Download

		uploadDiff := currentUpload - lastUpload
		downloadDiff := currentDownload - lastDownload

		if uploadDiff < 0 || downloadDiff < 0 {
			settings.PendingReset = ResetTracker{
				Upload:     lastUpload,
				Download:   lastDownload,
				ObservedAt: now.Unix(),
				Active:     true,
			}
			if uploadDiff < 0 {
				uploadDiff = currentUpload
			}
			if downloadDiff < 0 {
				downloadDiff = currentDownload
			}
		}

		if settings.PendingReset.Active {
			var expired bool
			if settings.PendingReset.ObservedAt > 0 {
				observedAt := time.Unix(settings.PendingReset.ObservedAt, 0)
				expired = now.Sub(observedAt) > resetGracePeriod
			}

			if expired {
				settings.PendingReset = ResetTracker{}
			} else {
				adjusted := false
				deactivate := false

				if currentUpload >= settings.PendingReset.Upload {
					if lastUpload <= settings.PendingReset.Upload/2 {
						uploadDiff = currentUpload - settings.PendingReset.Upload
						adjusted = true
					} else {
						deactivate = true
					}
				}

				if currentDownload >= settings.PendingReset.Download {
					if lastDownload <= settings.PendingReset.Download/2 {
						downloadDiff = currentDownload - settings.PendingReset.Download
						adjusted = true
					} else {
						deactivate = true
					}
				}

				if adjusted {
					if uploadDiff < 0 {
						uploadDiff = 0
					}
					if downloadDiff < 0 {
						downloadDiff = 0
					}
					settings.PendingReset = ResetTracker{}
				} else if deactivate {
					settings.PendingReset = ResetTracker{}
				}
			}
		}

		if uploadDiff < 0 {
			uploadDiff = 0
		}
		if downloadDiff < 0 {
			downloadDiff = 0
		}
		totalDiff := uploadDiff + downloadDiff

		if settings.DailyUsage == nil {
			settings.DailyUsage = make(map[string]UsageStats)
		}

		dayUsage := settings.DailyUsage[currentDate]
		if uploadDiff > 0 {
			dayUsage.Upload += uploadDiff
		}
		if downloadDiff > 0 {
			dayUsage.Download += downloadDiff
		}
		if totalDiff > 0 {
			dayUsage.Total += totalDiff
		}
		settings.DailyUsage[currentDate] = dayUsage

		settings.LastStats = LastStats{
			Upload:   currentUpload,
			Download: currentDownload,
			Total:    currentTotal,
		}
		return nil
	})
}

func resolveStatEntry(status map[string]interface{}) (map[string]interface{}, error) {
	val, ok := status["cellular_stats"]
	if !ok {
		return nil, fmt.Errorf("cellular_stats missing")
	}

	list, ok := val.([]interface{})
	if !ok || len(list) == 0 {
		return nil, fmt.Errorf("cellular_stats empty")
	}

	entry, ok := list[0].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid cellular_stats entry")
	}
	return entry, nil
}

func toInt64(v interface{}) int64 {
	switch val := v.(type) {
	case nil:
		return 0
	case int:
		return int64(val)
	case int32:
		return int64(val)
	case int64:
		return val
	case float32:
		return int64(val)
	case float64:
		return int64(val)
	case json.Number:
		i, _ := val.Int64()
		return i
	case string:
		i, _ := parseStringInt(val)
		return i
	default:
		return 0
	}
}

func parseStringInt(s string) (int64, error) {
	var result int64
	_, err := fmt.Sscanf(strings.TrimSpace(s), "%d", &result)
	return result, err
}

func isRecoverableSettingsError(err error) bool {
	if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		return true
	}
	var syntaxErr *json.SyntaxError
	if errors.As(err, &syntaxErr) {
		return true
	}
	var unmarshalErr *json.UnmarshalTypeError
	return errors.As(err, &unmarshalErr)
}

func (s *Store) recoverCorruptFile(_ error) error {
	backupPath := fmt.Sprintf("%s.corrupt-%d", s.path, time.Now().UTC().Unix())
	if err := os.Rename(s.path, backupPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		// If we cannot move it aside, attempt to remove to ensure a clean slate.
		_ = os.Remove(s.path)
	}

	s.data = defaultSettings()
	return s.save()
}
