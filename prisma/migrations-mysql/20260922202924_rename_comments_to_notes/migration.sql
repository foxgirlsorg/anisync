-- Rename importComments -> importNotes, preserving each destination's
-- existing preference.
ALTER TABLE `SyncDestinationConfig` RENAME COLUMN `importComments` TO `importNotes`;
