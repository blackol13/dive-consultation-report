import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamps = { createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull() };

export const students = sqliteTable("students", {
  id: text("id").primaryKey(), fullName: text("full_name").notNull(), schoolType: text("school_type").notNull().default(""),
  schoolName: text("school_name").notNull().default(""), grade: text("grade").notNull().default(""), currentLevel: text("current_level").notNull().default(""),
  currentClass: text("current_class").notNull().default(""), ...timestamps, archivedAt: text("archived_at"),
}, table => [index("idx_students_name_school").on(table.fullName, table.schoolName)]);

export const guardians = sqliteTable("guardians", {
  id: text("id").primaryKey(), studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(), relationship: text("relationship").notNull().default("보호자"),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(true), ...timestamps,
}, table => [index("idx_guardians_student").on(table.studentId)]);

export const consultations = sqliteTable("consultations", {
  id: text("id").primaryKey(), studentId: text("student_id").references(() => students.id, { onDelete: "restrict" }),
  formJson: text("form_json").notNull(), scheduledAt: text("scheduled_at").notNull().default(""), step: integer("step").notNull().default(1),
  hasRtp: integer("has_rtp", { mode: "boolean" }).notNull().default(false), rtpFile: text("rtp_file").notNull().default(""),
  rtpSkipped: integer("rtp_skipped", { mode: "boolean" }).notNull().default(false), rtpResultJson: text("rtp_result_json").notNull().default(""),
  audioFile: text("audio_file").notNull().default(""), audioSkipped: integer("audio_skipped", { mode: "boolean" }).notNull().default(false), summary: text("summary").notNull().default(""),
  sttSummary: text("stt_summary").notNull().default(""), consultationSummary: text("consultation_summary").notNull().default(""),
  directorComment: text("director_comment").notNull().default(""), status: text("status").notNull().default("상담 대기"),
  enrollmentStatus: text("enrollment_status").notNull().default("미확인"), enrollmentDate: text("enrollment_date").notNull().default(""),
  enrollmentNote: text("enrollment_note").notNull().default(""), staffNote: text("staff_note").notNull().default(""),
  staffNoteShared: integer("staff_note_shared", { mode: "boolean" }).notNull().default(false), assignedDirector: text("assigned_director").notNull().default(""),
  isNew: integer("is_new", { mode: "boolean" }).notNull().default(true), ...timestamps, deletedAt: text("deleted_at"),
}, table => [
  index("idx_consultations_status_updated").on(table.status, table.updatedAt), index("idx_consultations_schedule").on(table.scheduledAt),
  index("idx_consultations_student").on(table.studentId), index("idx_consultations_active_updated").on(table.deletedAt, table.updatedAt),
  check("consultations_step_range", sql`${table.step} between 1 and 4`),
]);

export const consultationNotes = sqliteTable("consultation_notes", {
  id: text("id").primaryKey(), consultationId: text("consultation_id").notNull().references(() => consultations.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("staff"), content: text("content").notNull(), isShared: integer("is_shared", { mode: "boolean" }).notNull().default(false),
  createdBy: text("created_by").notNull().default("담당자"), ...timestamps,
}, table => [index("idx_consultation_notes_consultation").on(table.consultationId, table.updatedAt)]);

export const consultationStatusHistory = sqliteTable("consultation_status_history", {
  id: text("id").primaryKey(), consultationId: text("consultation_id").notNull().references(() => consultations.id, { onDelete: "cascade" }),
  fromStatus: text("from_status").notNull().default(""), toStatus: text("to_status").notNull(), changedBy: text("changed_by").notNull().default("시스템"),
  createdAt: text("created_at").notNull(),
}, table => [index("idx_status_history_consultation").on(table.consultationId, table.createdAt)]);

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(), consultationId: text("consultation_id").references(() => consultations.id, { onDelete: "set null" }),
  name: text("name").notNull(), storageKey: text("storage_key").notNull(), category: text("category").notNull(), contentType: text("content_type").notNull(),
  size: integer("size").notNull(), processingStatus: text("processing_status").notNull().default("uploaded"), metadataJson: text("metadata_json").notNull().default("{}"),
  ...timestamps, deletedAt: text("deleted_at"),
}, table => [index("idx_attachments_category_created").on(table.category, table.createdAt), index("idx_attachments_consultation").on(table.consultationId)]);

export const legacyConsultationsTableSql = `CREATE TABLE IF NOT EXISTS consultations (
  id TEXT PRIMARY KEY, form_json TEXT NOT NULL, step INTEGER NOT NULL DEFAULT 1, has_rtp INTEGER NOT NULL DEFAULT 0,
  rtp_file TEXT NOT NULL DEFAULT '', rtp_skipped INTEGER NOT NULL DEFAULT 0, rtp_result_json TEXT NOT NULL DEFAULT '', audio_file TEXT NOT NULL DEFAULT '', audio_skipped INTEGER NOT NULL DEFAULT 0, summary TEXT NOT NULL DEFAULT '',
  stt_summary TEXT NOT NULL DEFAULT '', consultation_summary TEXT NOT NULL DEFAULT '', director_comment TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '상담 대기',
  enrollment_status TEXT NOT NULL DEFAULT '미확인', enrollment_date TEXT NOT NULL DEFAULT '', enrollment_note TEXT NOT NULL DEFAULT '', staff_note TEXT NOT NULL DEFAULT '',
  staff_note_shared INTEGER NOT NULL DEFAULT 0, is_new INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
)`;

export const operationalSchemaSql = [
  `CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, full_name TEXT NOT NULL, school_type TEXT NOT NULL DEFAULT '', school_name TEXT NOT NULL DEFAULT '', grade TEXT NOT NULL DEFAULT '', current_level TEXT NOT NULL DEFAULT '', current_class TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS guardians (id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE, phone TEXT NOT NULL, relationship TEXT NOT NULL DEFAULT '보호자', is_primary INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS consultation_notes (id TEXT PRIMARY KEY, consultation_id TEXT NOT NULL REFERENCES consultations(id) ON DELETE CASCADE, kind TEXT NOT NULL DEFAULT 'staff', content TEXT NOT NULL, is_shared INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL DEFAULT '담당자', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS consultation_status_history (id TEXT PRIMARY KEY, consultation_id TEXT NOT NULL REFERENCES consultations(id) ON DELETE CASCADE, from_status TEXT NOT NULL DEFAULT '', to_status TEXT NOT NULL, changed_by TEXT NOT NULL DEFAULT '시스템', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, consultation_id TEXT REFERENCES consultations(id) ON DELETE SET NULL, name TEXT NOT NULL, storage_key TEXT NOT NULL, category TEXT NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL, processing_status TEXT NOT NULL DEFAULT 'uploaded', metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_students_name_school ON students(full_name, school_name)`, `CREATE INDEX IF NOT EXISTS idx_guardians_student ON guardians(student_id)`,
  `CREATE INDEX IF NOT EXISTS idx_consultations_status_updated ON consultations(status, updated_at)`, `CREATE INDEX IF NOT EXISTS idx_consultations_schedule ON consultations(scheduled_at)`,
  `CREATE INDEX IF NOT EXISTS idx_consultations_student ON consultations(student_id)`, `CREATE INDEX IF NOT EXISTS idx_consultations_active_updated ON consultations(deleted_at, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_consultation_notes_consultation ON consultation_notes(consultation_id, updated_at)`, `CREATE INDEX IF NOT EXISTS idx_status_history_consultation ON consultation_status_history(consultation_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_category_created ON attachments(category, created_at)`, `CREATE INDEX IF NOT EXISTS idx_attachments_consultation ON attachments(consultation_id)`,
] as const;
