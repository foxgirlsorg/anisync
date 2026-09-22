-- Tracks entries that were already up to date and needed no API call,
-- distinct from actual failures ("skipped").
ALTER TABLE "SyncRunResult" ADD COLUMN "unchanged" INTEGER NOT NULL DEFAULT 0;
