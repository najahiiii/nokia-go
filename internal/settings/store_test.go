package settings

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestUpdateUsageTemporaryResetDoesNotDoubleCount(t *testing.T) {
	store := newTestStore(t)
	today := time.Now().Format("2006-01-02")

	mustUpdateUsage(t, store, fakeStatus(1000, 2000))

	usage := store.Get().DailyUsage[today]
	if usage.Upload != 1000 || usage.Download != 2000 {
		t.Fatalf("unexpected usage after baseline: %+v", usage)
	}

	mustUpdateUsage(t, store, fakeStatus(0, 0))
	usage = store.Get().DailyUsage[today]
	if usage.Upload != 1000 || usage.Download != 2000 {
		t.Fatalf("reset should not change totals: %+v", usage)
	}

	mustUpdateUsage(t, store, fakeStatus(50, 120))
	usage = store.Get().DailyUsage[today]
	if usage.Upload != 1050 || usage.Download != 2120 {
		t.Fatalf("expected new usage added after reset, got %+v", usage)
	}

	mustUpdateUsage(t, store, fakeStatus(1000, 2000))
	usage = store.Get().DailyUsage[today]
	if usage.Upload != 1050 || usage.Download != 2120 {
		t.Fatalf("duplicate totals detected after counters returned: %+v", usage)
	}
}

func TestNormalizeUsageTotalsAdjustsDailyAndLast(t *testing.T) {
	settingsData := Settings{
		DailyUsage: map[string]UsageStats{
			"2024-05-01": {Upload: 100, Download: 200, Total: 0},
			"2024-05-02": {Upload: 0, Download: 0, Total: 0},
		},
		LastStats: LastStats{Upload: 5, Download: 7, Total: 0},
	}

	result := NormalizeUsageTotals(&settingsData)

	if len(result.AdjustedDays) != 1 || result.AdjustedDays[0] != "2024-05-01" {
		t.Fatalf("unexpected adjusted days: %+v", result.AdjustedDays)
	}
	if !result.LastStatsAdjusted {
		t.Fatalf("expected last stats flag to be set")
	}

	day := settingsData.DailyUsage["2024-05-01"]
	if day.Total != 300 {
		t.Fatalf("expected total to equal upload+download, got %+v", day)
	}
	if settingsData.LastStats.Total != 12 {
		t.Fatalf("expected last stats total to be 12, got %+v", settingsData.LastStats)
	}
}

func TestNewStoreNormalizesExistingFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "settings.json")
	initial := []byte(`{
		"data_expired": 0,
		"daily_usage": {
			"2024-05-01": {"upload": 10, "download": 20, "total": 0}
		},
		"last_stats": {"upload": 5, "download": 10, "total": 0},
		"pending_reset": {"upload":0,"download":0,"observed_at":0,"active":false}
	}`)
	if err := os.WriteFile(path, initial, 0o644); err != nil {
		t.Fatalf("failed to seed settings file: %v", err)
	}

	store, err := NewStore(path)
	if err != nil {
		t.Fatalf("NewStore returned error: %v", err)
	}

	usage := store.Get().DailyUsage["2024-05-01"]
	if usage.Total != usage.Upload+usage.Download {
		t.Fatalf("expected total to be normalised, got %+v", usage)
	}
	if store.Get().LastStats.Total != store.Get().LastStats.Upload+store.Get().LastStats.Download {
		t.Fatalf("expected last stats total to be normalised, got %+v", store.Get().LastStats)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read rewritten settings: %v", err)
	}
	var decoded Settings
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("failed to decode rewritten file: %v", err)
	}
	if decoded.DailyUsage["2024-05-01"].Total != 30 {
		t.Fatalf("expected persisted total to be 30, got %+v", decoded.DailyUsage["2024-05-01"])
	}
	if decoded.LastStats.Total != 15 {
		t.Fatalf("expected persisted last stats total to be 15, got %+v", decoded.LastStats)
	}
}

func TestUpdateUsageCountsNewDataAfterReset(t *testing.T) {
	store := newTestStore(t)
	today := time.Now().Format("2006-01-02")

	mustUpdateUsage(t, store, fakeStatus(700, 900))

	mustUpdateUsage(t, store, fakeStatus(100, 120))
	usage := store.Get().DailyUsage[today]
	if usage.Upload != 800 || usage.Download != 1020 {
		t.Fatalf("expected usage to grow on counter drop, got %+v", usage)
	}

	mustUpdateUsage(t, store, fakeStatus(130, 150))
	usage = store.Get().DailyUsage[today]
	if usage.Upload != 830 || usage.Download != 1050 {
		t.Fatalf("expected incremental usage after reset, got %+v", usage)
	}
}

func TestNewStoreRecoversFromCorruptFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "settings.json")
	if err := os.WriteFile(path, []byte(`{"daily_usage":{}`), 0o644); err != nil {
		t.Fatalf("failed to write corrupt file: %v", err)
	}

	store, err := NewStore(path)
	if err != nil {
		t.Fatalf("expected recovery from corrupt file, got error: %v", err)
	}

	if len(store.Get().DailyUsage) != 0 {
		t.Fatalf("expected empty usage after recovery")
	}

	stat, err := os.Stat(path)
	if err != nil {
		t.Fatalf("expected rewritten settings.json, got stat error: %v", err)
	}
	if stat.Size() == 0 {
		t.Fatalf("expected settings.json to contain data after recovery")
	}

	backups, err := filepath.Glob(path + ".corrupt-*")
	if err != nil {
		t.Fatalf("failed to list backup files: %v", err)
	}
	if len(backups) != 1 {
		t.Fatalf("expected a single corrupt backup file, got %d", len(backups))
	}
}

func TestNewStoreRecoversFromEmptyFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "settings.json")
	if err := os.WriteFile(path, []byte{}, 0o644); err != nil {
		t.Fatalf("failed to write empty file: %v", err)
	}

	store, err := NewStore(path)
	if err != nil {
		t.Fatalf("expected recovery from empty file, got error: %v", err)
	}

	settings := store.Get()
	if settings.DailyUsage == nil {
		t.Fatalf("expected DailyUsage map to be initialised")
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read regenerated settings.json: %v", err)
	}
	var decoded Settings
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("expected regenerated file to be valid JSON, got %v", err)
	}
}

func newTestStore(t *testing.T) *Store {
	t.Helper()
	path := filepath.Join(t.TempDir(), "settings.json")
	store, err := NewStore(path)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	return store
}

func mustUpdateUsage(t *testing.T, store *Store, status map[string]interface{}) {
	t.Helper()
	if err := store.UpdateUsageFromStatus(status); err != nil {
		t.Fatalf("failed to update usage: %v", err)
	}
}

func fakeStatus(upload, download int64) map[string]interface{} {
	return map[string]interface{}{
		"cellular_stats": []interface{}{
			map[string]interface{}{
				"BytesSent":     upload,
				"BytesReceived": download,
			},
		},
	}
}
