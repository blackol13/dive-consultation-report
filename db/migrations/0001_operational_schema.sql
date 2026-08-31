CREATE TABLE IF NOT EXISTS app_schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  school_type TEXT NOT NULL DEFAULT '',
  school_name TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  current_level TEXT NOT NULL DEFAULT '',
  current_class TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS guardians (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT '보호자',
  is_primary INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consultation_notes (
  id TEXT PRIMARY KEY,
  consultation_id TEXT NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'staff',
  content TEXT NOT NULL,
  is_shared INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT '담당자',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consultation_status_history (
  id TEXT PRIMARY KEY,
  consultation_id TEXT NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL DEFAULT '',
  to_status TEXT NOT NULL,
  changed_by TEXT NOT NULL DEFAULT '시스템',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_students_name_school ON students(full_name, school_name);
CREATE INDEX IF NOT EXISTS idx_guardians_student ON guardians(student_id);
CREATE INDEX IF NOT EXISTS idx_consultations_status_updated ON consultations(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_consultations_schedule ON consultations(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_consultations_student ON consultations(student_id);
CREATE INDEX IF NOT EXISTS idx_consultations_active_updated ON consultations(deleted_at, updated_at);
CREATE INDEX IF NOT EXISTS idx_consultation_notes_consultation ON consultation_notes(consultation_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_status_history_consultation ON consultation_status_history(consultation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attachments_category_created ON attachments(category, created_at);
CREATE INDEX IF NOT EXISTS idx_attachments_consultation ON attachments(consultation_id);

PRAGMA optimize;
