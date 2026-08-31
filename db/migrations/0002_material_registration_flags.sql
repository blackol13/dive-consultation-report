ALTER TABLE consultations ADD COLUMN rtp_skipped INTEGER NOT NULL DEFAULT 0;
ALTER TABLE consultations ADD COLUMN audio_skipped INTEGER NOT NULL DEFAULT 0;
INSERT OR IGNORE INTO app_schema_migrations (version, applied_at) VALUES (2, CURRENT_TIMESTAMP);
PRAGMA optimize;
