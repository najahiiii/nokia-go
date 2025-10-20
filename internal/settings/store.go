package settings

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

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

type Settings struct {
	DataExpired int64                 `json:"data_expired"`
	DailyUsage  map[string]UsageStats `json:"daily_usage"`
	LastStats   LastStats             `json:"last_stats"`
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
	}
}

func (s *Store) load() error {
	file, err := os.Open(s.path)
	if err != nil {
		return err
	}
	defer file.Close()

	var data Settings
	if err := json.NewDecoder(file).Decode(&data); err != nil {
		return err
	}

	if data.DailyUsage == nil {
		data.DailyUsage = map[string]UsageStats{}
	}
	s.data = data
	return nil
}

func (s *Store) save() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}

	file, err := os.Create(s.path)
	if err != nil {
		return err
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	return encoder.Encode(s.data)
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
		DataExpired: src.DataExpired,
		DailyUsage:  copyUsage,
		LastStats:   src.LastStats,
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
		currentDate := time.Now().Format("2006-01-02")

		lastUpload := settings.LastStats.Upload
		lastDownload := settings.LastStats.Download
		lastTotal := lastUpload + lastDownload

		uploadDiff := currentUpload - lastUpload
		downloadDiff := currentDownload - lastDownload
		totalDiff := currentTotal - lastTotal

		if uploadDiff < 0 {
			uploadDiff = currentUpload
		}
		if downloadDiff < 0 {
			downloadDiff = currentDownload
		}
		if totalDiff < 0 {
			totalDiff = currentTotal
		}

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
