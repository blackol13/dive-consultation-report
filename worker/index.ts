/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { ensureOperationalDatabase, recordStatusChange, syncConsultationRelations, type ConsultationForm } from "../db/runtime";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  FILES: R2Bucket;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/consultations") {
      await ensureOperationalDatabase(env.DB);
      if (request.method === "GET") {
        const result = await env.DB.prepare("SELECT id, form_json, step, has_rtp, rtp_file, rtp_result_json, audio_file, summary, stt_summary, consultation_summary, director_comment, status, enrollment_status, enrollment_date, enrollment_note, staff_note, staff_note_shared, is_new, updated_at FROM consultations WHERE deleted_at IS NULL ORDER BY updated_at DESC").all<{
          id:string;form_json:string;step:number;has_rtp:number;rtp_file:string;rtp_result_json:string;audio_file:string;summary:string;stt_summary:string;consultation_summary:string;director_comment:string;status:string;enrollment_status:string;enrollment_date:string;enrollment_note:string;staff_note:string;staff_note_shared:number;is_new:number;updated_at:string
        }>();
        return Response.json({ consultations: result.results.map(row=>({id:row.id,form:JSON.parse(row.form_json),step:row.step,hasRtp:Boolean(row.has_rtp),rtp:row.rtp_file,rtpResult:row.rtp_result_json?JSON.parse(row.rtp_result_json):null,audio:row.audio_file,summary:row.summary,sttSummary:row.stt_summary,consult:row.consultation_summary,comment:row.director_comment,status:row.status,enrollmentStatus:row.enrollment_status,enrollmentDate:row.enrollment_date,enrollmentNote:row.enrollment_note,staffNote:row.staff_note,staffNoteShared:Boolean(row.staff_note_shared),isNew:Boolean(row.is_new),updatedAt:row.updated_at})) });
      }
      if (request.method === "POST" || request.method === "PUT") {
        const body = await request.json() as {id?:string;form:ConsultationForm;step:number;hasRtp:boolean;rtp:string;rtpResult?:unknown;audio:string;summary:string;sttSummary:string;consult:string;comment:string;status:string;enrollmentStatus?:string;enrollmentDate?:string;enrollmentNote?:string;staffNote?:string;staffNoteShared?:boolean};
        const id = body.id || crypto.randomUUID();
        const now = new Date().toISOString();
        const nextStatus = body.status || "상담 대기";
        if (request.method === "POST") {
          await env.DB.prepare("INSERT INTO consultations (id, form_json, step, has_rtp, rtp_file, rtp_result_json, audio_file, summary, stt_summary, consultation_summary, director_comment, status, enrollment_status, enrollment_date, enrollment_note, staff_note, staff_note_shared, is_new, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(id,JSON.stringify(body.form),body.step,body.hasRtp?1:0,body.rtp||"",body.rtpResult?JSON.stringify(body.rtpResult):"",body.audio||"",body.summary||"",body.sttSummary||"",body.consult||"",body.comment||"",nextStatus,body.enrollmentStatus||"미확인",body.enrollmentDate||"",body.enrollmentNote||"",body.staffNote||"",body.staffNoteShared?1:0,1,now,now).run();
          await syncConsultationRelations(env.DB,id,body.form,body.staffNote||"",Boolean(body.staffNoteShared),now);
          await recordStatusChange(env.DB,id,"",nextStatus,"담당자",now);
        } else {
          const previous = await env.DB.prepare("SELECT status FROM consultations WHERE id = ? AND deleted_at IS NULL").bind(id).first<{status:string}>();
          if (!previous) return Response.json({ error: "상담 기록을 찾을 수 없습니다." }, { status: 404 });
          await env.DB.prepare("UPDATE consultations SET form_json = ?, step = ?, has_rtp = ?, rtp_file = ?, rtp_result_json = ?, audio_file = ?, summary = ?, stt_summary = ?, consultation_summary = ?, director_comment = ?, status = ?, enrollment_status = ?, enrollment_date = ?, enrollment_note = ?, staff_note = ?, staff_note_shared = ?, updated_at = ? WHERE id = ?")
            .bind(JSON.stringify(body.form),body.step,body.hasRtp?1:0,body.rtp||"",body.rtpResult?JSON.stringify(body.rtpResult):"",body.audio||"",body.summary||"",body.sttSummary||"",body.consult||"",body.comment||"",nextStatus,body.enrollmentStatus||"미확인",body.enrollmentDate||"",body.enrollmentNote||"",body.staffNote||"",body.staffNoteShared?1:0,now,id).run();
          await syncConsultationRelations(env.DB,id,body.form,body.staffNote||"",Boolean(body.staffNoteShared),now);
          await recordStatusChange(env.DB,id,previous.status,nextStatus,"시스템",now);
        }
        return Response.json({ id });
      }
      if (request.method === "PATCH") {
        const id = url.searchParams.get("id");
        if (!id) return Response.json({ error: "상담 ID가 필요합니다." }, { status: 400 });
        await env.DB.prepare("UPDATE consultations SET is_new = 0 WHERE id = ?").bind(id).run();
        return Response.json({ ok: true });
      }
      if (request.method === "DELETE") {
        const id = url.searchParams.get("id");
        if (!id) return Response.json({ error: "상담 ID가 필요합니다." }, { status: 400 });
        const now = new Date().toISOString();
        const previous = await env.DB.prepare("SELECT status FROM consultations WHERE id = ? AND deleted_at IS NULL").bind(id).first<{status:string}>();
        if (!previous) return Response.json({ error: "상담 기록을 찾을 수 없습니다." }, { status: 404 });
        await env.DB.prepare("UPDATE consultations SET deleted_at = ?, updated_at = ? WHERE id = ?").bind(now,now,id).run();
        await recordStatusChange(env.DB,id,previous.status,"삭제됨","담당자",now);
        return Response.json({ ok: true });
      }
      return new Response("Method not allowed", { status: 405 });
    }

    if (url.pathname === "/api/files") {
      await ensureOperationalDatabase(env.DB);

      if (request.method === "GET" && url.searchParams.has("id")) {
        const id = url.searchParams.get("id")!;
        const row = await env.DB.prepare("SELECT name, content_type, storage_key FROM attachments WHERE id = ? AND deleted_at IS NULL").bind(id).first<{name:string;content_type:string;storage_key:string}>();
        const object = row ? await env.FILES.get(row.storage_key || id) : null;
        if (!row || !object) return new Response("Not found", { status: 404 });
        return new Response(object.body, { headers: { "content-type": row.content_type, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}` } });
      }

      if (request.method === "GET") {
        const result = await env.DB.prepare("SELECT id, name, category, content_type AS contentType, size, processing_status AS processingStatus, created_at AS createdAt FROM attachments WHERE deleted_at IS NULL ORDER BY created_at DESC").all();
        return Response.json({ files: result.results });
      }

      if (request.method === "POST") {
        const form = await request.formData();
        const file = form.get("file");
        const category = String(form.get("category") ?? "");
        if (!(file instanceof File) || !["rtp", "consultation"].includes(category)) return Response.json({ error: "올바른 파일을 선택해 주세요." }, { status: 400 });
        const contentType = file.type.toLowerCase().split(";")[0];
        const isRtp = category === "rtp" && contentType === "application/pdf";
        const isRecording = category === "consultation" && ["audio/wav", "audio/x-wav", "video/mp4", "audio/mp4", "audio/webm"].includes(contentType);
        if (!isRtp && !isRecording) return Response.json({ error: category === "rtp" ? "PDF 파일만 등록할 수 있습니다." : "WAV, MP4(M4A) 또는 WEBM 파일만 등록할 수 있습니다." }, { status: 400 });
        const id = crypto.randomUUID();
        const storageKey = `${category}/${id}`;
        const now = new Date().toISOString();
        await env.FILES.put(storageKey, file.stream(), { httpMetadata: { contentType }, customMetadata: { originalName: file.name, category } });
        await env.DB.prepare("INSERT INTO attachments (id, name, storage_key, category, content_type, size, processing_status, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'uploaded', '{}', ?, ?)").bind(id,file.name,storageKey,category,contentType,file.size,now,now).run();
        return Response.json({ ok: true }, { status: 201 });
      }

      if (request.method === "DELETE") {
        const id = url.searchParams.get("id");
        if (!id) return Response.json({ error: "파일 ID가 필요합니다." }, { status: 400 });
        const row = await env.DB.prepare("SELECT storage_key FROM attachments WHERE id = ? AND deleted_at IS NULL").bind(id).first<{storage_key:string}>();
        if (!row) return Response.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
        await env.FILES.delete(row.storage_key || id);
        const now = new Date().toISOString();
        await env.DB.prepare("UPDATE attachments SET deleted_at = ?, updated_at = ? WHERE id = ?").bind(now,now,id).run();
        return Response.json({ ok: true });
      }
      return new Response("Method not allowed", { status: 405 });
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
