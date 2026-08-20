/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { consultationsTableSql } from "../db/schema";

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
      await env.DB.prepare(consultationsTableSql).run();
      const consultationColumns = await env.DB.prepare("PRAGMA table_info(consultations)").all<{name:string}>();
      if (!consultationColumns.results.some(column => column.name === "stt_summary")) {
        await env.DB.prepare("ALTER TABLE consultations ADD COLUMN stt_summary TEXT NOT NULL DEFAULT ''").run();
      }
      if (request.method === "GET") {
        const result = await env.DB.prepare("SELECT id, form_json, step, has_rtp, rtp_file, audio_file, summary, stt_summary, consultation_summary, director_comment, status, updated_at FROM consultations ORDER BY updated_at DESC").all<{
          id:string;form_json:string;step:number;has_rtp:number;rtp_file:string;audio_file:string;summary:string;stt_summary:string;consultation_summary:string;director_comment:string;status:string;updated_at:string
        }>();
        return Response.json({ consultations: result.results.map(row=>({id:row.id,form:JSON.parse(row.form_json),step:row.step,hasRtp:Boolean(row.has_rtp),rtp:row.rtp_file,audio:row.audio_file,summary:row.summary,sttSummary:row.stt_summary,consult:row.consultation_summary,comment:row.director_comment,status:row.status,updatedAt:row.updated_at})) });
      }
      if (request.method === "POST" || request.method === "PUT") {
        const body = await request.json() as {id?:string;form:unknown;step:number;hasRtp:boolean;rtp:string;audio:string;summary:string;sttSummary:string;consult:string;comment:string;status:string};
        const id = body.id || crypto.randomUUID();
        const now = new Date().toISOString();
        if (request.method === "POST") {
          await env.DB.prepare("INSERT INTO consultations (id, form_json, step, has_rtp, rtp_file, audio_file, summary, stt_summary, consultation_summary, director_comment, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(id,JSON.stringify(body.form),body.step,body.hasRtp?1:0,body.rtp||"",body.audio||"",body.summary||"",body.sttSummary||"",body.consult||"",body.comment||"",body.status||"상담 대기",now,now).run();
        } else {
          await env.DB.prepare("UPDATE consultations SET form_json = ?, step = ?, has_rtp = ?, rtp_file = ?, audio_file = ?, summary = ?, stt_summary = ?, consultation_summary = ?, director_comment = ?, status = ?, updated_at = ? WHERE id = ?")
            .bind(JSON.stringify(body.form),body.step,body.hasRtp?1:0,body.rtp||"",body.audio||"",body.summary||"",body.sttSummary||"",body.consult||"",body.comment||"",body.status||"상담 대기",now,id).run();
        }
        return Response.json({ id });
      }
      if (request.method === "DELETE") {
        const id = url.searchParams.get("id");
        if (!id) return Response.json({ error: "상담 ID가 필요합니다." }, { status: 400 });
        await env.DB.prepare("DELETE FROM consultations WHERE id = ?").bind(id).run();
        return Response.json({ ok: true });
      }
      return new Response("Method not allowed", { status: 405 });
    }

    if (url.pathname === "/api/files") {
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )`).run();

      if (request.method === "GET" && url.searchParams.has("id")) {
        const id = url.searchParams.get("id")!;
        const row = await env.DB.prepare("SELECT name, content_type FROM attachments WHERE id = ?").bind(id).first<{name:string;content_type:string}>();
        const object = await env.FILES.get(id);
        if (!row || !object) return new Response("Not found", { status: 404 });
        return new Response(object.body, { headers: { "content-type": row.content_type, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}` } });
      }

      if (request.method === "GET") {
        const result = await env.DB.prepare("SELECT id, name, category, content_type AS contentType, size, created_at AS createdAt FROM attachments ORDER BY created_at DESC").all();
        return Response.json({ files: result.results });
      }

      if (request.method === "POST") {
        const form = await request.formData();
        const file = form.get("file");
        const category = String(form.get("category") ?? "");
        if (!(file instanceof File) || !["rtp", "consultation"].includes(category)) return Response.json({ error: "올바른 파일을 선택해 주세요." }, { status: 400 });
        const isRtp = category === "rtp" && file.type === "application/pdf";
        const isRecording = category === "consultation" && (file.type === "audio/wav" || file.type === "audio/x-wav" || file.type === "video/mp4");
        if (!isRtp && !isRecording) return Response.json({ error: category === "rtp" ? "PDF 파일만 등록할 수 있습니다." : "WAV 또는 MP4 파일만 등록할 수 있습니다." }, { status: 400 });
        const id = crypto.randomUUID();
        await env.FILES.put(id, file.stream(), { httpMetadata: { contentType: file.type } });
        await env.DB.prepare("INSERT INTO attachments (id, name, category, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, file.name, category, file.type, file.size, new Date().toISOString()).run();
        return Response.json({ ok: true }, { status: 201 });
      }

      if (request.method === "DELETE") {
        const id = url.searchParams.get("id");
        if (!id) return Response.json({ error: "파일 ID가 필요합니다." }, { status: 400 });
        await env.FILES.delete(id);
        await env.DB.prepare("DELETE FROM attachments WHERE id = ?").bind(id).run();
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
