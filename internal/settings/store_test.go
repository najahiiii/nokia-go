package settings

import (
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
