-- Rename importComments -> importNotes, preserving each destination's
-- existing preference (SQLite 3.25+ supports RENAME COLUMN directly, no
-- need for the full table-rebuild dance).
ALTER TABLE "SyncDestinationConfig" RENAME COLUMN "importComments" TO "importNotes";
