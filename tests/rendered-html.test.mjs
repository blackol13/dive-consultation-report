import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the DIVE consultation workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>DIVE 상담 리포트<\/title>/i);
  assert.match(html, /DIVE CONSULTATION DESK/);
  assert.match(html, /신규 상담 등록/);
  assert.match(html, /상담 기록/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("defines the operational D1 and R2 data model", async () => {
  const [schema, runtime, worker, hosting] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);
  for (const table of ["students", "guardians", "consultations", "consultation_notes", "consultation_status_history", "attachments"]) {
    assert.match(schema, new RegExp(`\\b${table}\\b`));
  }
  assert.match(runtime, /app_schema_migrations/);
  assert.match(runtime, /PRAGMA optimize/);
  assert.match(worker, /deleted_at IS NULL/);
  assert.match(worker, /recordStatusChange/);
  assert.match(worker, /env\.FILES\.put\(storageKey/);
  assert.deepEqual(JSON.parse(hosting), {
    project_id: "appgprj_6a86b255e6f08191a70ba3c61e8f66ac",
    d1: "DB",
    r2: "FILES",
  });
});
