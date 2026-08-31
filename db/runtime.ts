import { legacyConsultationsTableSql, operationalSchemaSql } from "./schema";

export type ConsultationForm = {
  name?: string; schoolType?: string; school?: string; grade?: string; guardianPhone?: string;
  date?: string; consultationTime?: string; level?: string; className?: string; director?: string;
};

const consultationColumns = [
  ["stt_summary", "TEXT NOT NULL DEFAULT ''"], ["enrollment_status", "TEXT NOT NULL DEFAULT '미확인'"],
  ["enrollment_date", "TEXT NOT NULL DEFAULT ''"], ["enrollment_note", "TEXT NOT NULL DEFAULT ''"],
  ["staff_note", "TEXT NOT NULL DEFAULT ''"], ["staff_note_shared", "INTEGER NOT NULL DEFAULT 0"],
  ["rtp_result_json", "TEXT NOT NULL DEFAULT ''"], ["is_new", "INTEGER NOT NULL DEFAULT 0"],
  ["student_id", "TEXT"], ["scheduled_at", "TEXT NOT NULL DEFAULT ''"],
  ["assigned_director", "TEXT NOT NULL DEFAULT ''"], ["deleted_at", "TEXT"],
] as const;

const attachmentColumns = [
  ["consultation_id", "TEXT"], ["storage_key", "TEXT NOT NULL DEFAULT ''"],
  ["processing_status", "TEXT NOT NULL DEFAULT 'uploaded'"], ["metadata_json", "TEXT NOT NULL DEFAULT '{}'"],
  ["updated_at", "TEXT NOT NULL DEFAULT ''"], ["deleted_at", "TEXT"],
] as const;

const legacyAttachmentsSql = `CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, content_type TEXT NOT NULL,
  size INTEGER NOT NULL, created_at TEXT NOT NULL
)`;

async function addMissingColumns(db: D1Database, table: string, columns: readonly (readonly [string, string])[]) {
  const info = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  const existing = new Set(info.results.map(column => column.name));
  for (const [name, definition] of columns) {
    if (!existing.has(name)) await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`).run();
  }
}

function parseForm(value: string): ConsultationForm {
  try { return JSON.parse(value) as ConsultationForm; } catch { return {}; }
}

export function scheduledAt(form: ConsultationForm) {
  return form.date ? `${form.date}T${form.consultationTime || "00:00"}:00+09:00` : "";
}

export async function ensureOperationalDatabase(db: D1Database) {
  await db.prepare("CREATE TABLE IF NOT EXISTS app_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)").run();
  const migration = await db.prepare("SELECT MAX(version) AS version FROM app_schema_migrations").first<{ version: number | null }>();
  if ((migration?.version || 0) >= 1) return;
  await db.batch([db.prepare(legacyConsultationsTableSql), db.prepare(legacyAttachmentsSql)]);
  await addMissingColumns(db, "consultations", consultationColumns);
  await addMissingColumns(db, "attachments", attachmentColumns);
  await db.batch(operationalSchemaSql.slice(0, 5).map(statement => db.prepare(statement)));
  await db.batch(operationalSchemaSql.slice(5).map(statement => db.prepare(statement)));

  const legacyRows = await db.prepare("SELECT id, form_json, staff_note, staff_note_shared, status, created_at, updated_at FROM consultations WHERE student_id IS NULL").all<{
    id: string; form_json: string; staff_note: string; staff_note_shared: number; status: string; created_at: string; updated_at: string;
  }>();
  for (const row of legacyRows.results) {
    const form = parseForm(row.form_json);
    const studentId = crypto.randomUUID();
    const guardianId = crypto.randomUUID();
    const statements = [
      db.prepare("INSERT INTO students (id, full_name, school_type, school_name, grade, current_level, current_class, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(studentId, form.name || "이름 미등록", form.schoolType || "", form.school || "", form.grade || "", form.level || "", form.className || "", row.created_at, row.updated_at),
      db.prepare("INSERT INTO guardians (id, student_id, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
        .bind(guardianId, studentId, form.guardianPhone || "", row.created_at, row.updated_at),
      db.prepare("UPDATE consultations SET student_id = ?, scheduled_at = ?, assigned_director = ? WHERE id = ?")
        .bind(studentId, scheduledAt(form), form.director || "", row.id),
      db.prepare("INSERT OR IGNORE INTO consultation_status_history (id, consultation_id, from_status, to_status, changed_by, created_at) VALUES (?, ?, '', ?, '데이터 마이그레이션', ?)")
        .bind(`initial-${row.id}`, row.id, row.status, row.created_at),
    ];
    if (row.staff_note) statements.push(db.prepare("INSERT OR IGNORE INTO consultation_notes (id, consultation_id, kind, content, is_shared, created_by, created_at, updated_at) VALUES (?, ?, 'staff', ?, ?, '담당자', ?, ?)")
      .bind(`staff-${row.id}`, row.id, row.staff_note, row.staff_note_shared, row.created_at, row.updated_at));
    await db.batch(statements);
  }
  const appliedAt = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE attachments SET storage_key = id, updated_at = created_at WHERE storage_key = ''"),
    db.prepare("INSERT OR IGNORE INTO app_schema_migrations (version, applied_at) VALUES (1, ?)").bind(appliedAt),
    db.prepare("PRAGMA optimize"),
  ]);
}

export async function syncConsultationRelations(db: D1Database, consultationId: string, form: ConsultationForm, staffNote: string, staffNoteShared: boolean, now: string) {
  const existing = await db.prepare("SELECT student_id FROM consultations WHERE id = ?").bind(consultationId).first<{ student_id: string | null }>();
  const studentId = existing?.student_id || crypto.randomUUID();
  const guardian = existing?.student_id
    ? await db.prepare("SELECT id FROM guardians WHERE student_id = ? AND is_primary = 1 LIMIT 1").bind(studentId).first<{ id: string }>()
    : null;
  const guardianId = guardian?.id || crypto.randomUUID();
  const statements = existing?.student_id ? [
    db.prepare("UPDATE students SET full_name = ?, school_type = ?, school_name = ?, grade = ?, current_level = ?, current_class = ?, updated_at = ? WHERE id = ?")
      .bind(form.name || "이름 미등록", form.schoolType || "", form.school || "", form.grade || "", form.level || "", form.className || "", now, studentId),
  ] : [
    db.prepare("INSERT INTO students (id, full_name, school_type, school_name, grade, current_level, current_class, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(studentId, form.name || "이름 미등록", form.schoolType || "", form.school || "", form.grade || "", form.level || "", form.className || "", now, now),
  ];
  statements.push(guardian
    ? db.prepare("UPDATE guardians SET phone = ?, updated_at = ? WHERE id = ?").bind(form.guardianPhone || "", now, guardianId)
    : db.prepare("INSERT INTO guardians (id, student_id, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(guardianId, studentId, form.guardianPhone || "", now, now));
  statements.push(db.prepare("UPDATE consultations SET student_id = ?, scheduled_at = ?, assigned_director = ? WHERE id = ?")
    .bind(studentId, scheduledAt(form), form.director || "", consultationId));
  if (staffNote.trim()) statements.push(db.prepare(`INSERT INTO consultation_notes (id, consultation_id, kind, content, is_shared, created_by, created_at, updated_at)
    VALUES (?, ?, 'staff', ?, ?, '담당자', ?, ?) ON CONFLICT(id) DO UPDATE SET content = excluded.content, is_shared = excluded.is_shared, updated_at = excluded.updated_at`)
    .bind(`staff-${consultationId}`, consultationId, staffNote.trim(), staffNoteShared ? 1 : 0, now, now));
  else statements.push(db.prepare("DELETE FROM consultation_notes WHERE id = ?").bind(`staff-${consultationId}`));
  await db.batch(statements);
}

export async function recordStatusChange(db: D1Database, consultationId: string, fromStatus: string, toStatus: string, changedBy: string, now: string) {
  if (fromStatus === toStatus) return;
  await db.prepare("INSERT INTO consultation_status_history (id, consultation_id, from_status, to_status, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), consultationId, fromStatus, toStatus, changedBy, now).run();
}
