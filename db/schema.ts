export const consultationsTableSql = `CREATE TABLE IF NOT EXISTS consultations (
  id TEXT PRIMARY KEY,
  form_json TEXT NOT NULL,
  step INTEGER NOT NULL DEFAULT 1,
  has_rtp INTEGER NOT NULL DEFAULT 1,
  rtp_file TEXT NOT NULL DEFAULT '',
  audio_file TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  stt_summary TEXT NOT NULL DEFAULT '',
  consultation_summary TEXT NOT NULL DEFAULT '',
  director_comment TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '상담 대기',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;
