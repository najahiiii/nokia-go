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
