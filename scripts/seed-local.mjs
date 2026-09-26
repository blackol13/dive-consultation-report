// 로컬 미리보기용 샘플 데이터 시드 스크립트.
// 사용법: 개발 서버(npm run dev) 실행 후 `npm run seed` (기본 대상 http://localhost:3000)
// 로컬 Miniflare D1/R2(.wrangler/)에만 쓰며 라이브 데이터에는 영향을 주지 않는다.
const base = process.env.SEED_BASE_URL || "http://localhost:3000";
const host = new URL(base).hostname;
if (!["localhost", "127.0.0.1", "0.0.0.0"].includes(host) && process.env.SEED_ALLOW_REMOTE !== "1") {
  console.error(`로컬 주소가 아닙니다: ${base} (강제하려면 SEED_ALLOW_REMOTE=1)`);
  process.exit(1);
}

const seoulDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
};

const existing = await fetch(`${base}/api/consultations`).then(r => r.json());
if (existing.consultations?.length && !process.argv.includes("--force")) {
  console.log(`이미 상담 ${existing.consultations.length}건이 있어 시드를 건너뜁니다. (다시 넣으려면 --force)`);
  process.exit(0);
}

const student = (name, schoolType, school, grade, date, consultationTime, extra = {}) => ({
  name, schoolType, school, grade, guardianPhone: "010-1234-5678",
  applicationDate: seoulDate(-3), date, consultationTime,
  sr: "", level: "", className: "", studentLevel: "", diveClass: "", director: "", ...extra,
});

const blank = { step: 2, hasRtp: false, rtp: "", rtpSkipped: false, rtpResult: null, audio: "", audioSkipped: false, summary: "", sttSummary: "", consult: "", comment: "", staffNote: "", staffNoteShared: false };

const records = [
  { ...blank, form: student("김하늘", "초등학교", "서울한빛초등학교", "4학년", seoulDate(0), "16:00"), status: "상담 대기", staffNote: "학부모님이 독해 습관을 가장 궁금해하심." },
  { ...blank, form: student("이도윤", "중학교", "새솔중학교", "1학년", seoulDate(0), "18:30"), status: "상담 대기" },
  { ...blank, form: student("박서연", "초등학교", "푸른숲초등학교", "6학년", seoulDate(2), "15:10"), status: "상담 대기" },
  { ...blank, form: student("최민준", "중학교", "한울중학교", "2학년", seoulDate(-2), "17:00"), status: "상담 대기" },
  { ...blank, step: 3, form: student("정유나", "초등학교", "해오름초등학교", "5학년", seoulDate(-1), "14:20"), status: "상담 작성 중", rtpSkipped: true, audioSkipped: true, summary: "추론 문항 정답률이 높고 어휘 영역 보완이 필요합니다." },
  { ...blank, step: 3, form: student("강지호", "중학교", "새솔중학교", "3학년", seoulDate(-4), "19:00", { studentLevel: "Level 5", diveClass: "월-수-금 18:00~19:10" }), status: "작성 완료", rtpSkipped: true, audioSkipped: true, summary: "전반적으로 안정적인 독해력을 보입니다.", consult: "학부모님은 내신 대비와 서술형 쓰기를 희망하셨습니다.", comment: "주 3회 수업으로 서술형 쓰기를 강화하겠습니다." },
  { ...blank, step: 4, form: student("윤채원", "초등학교", "서울한빛초등학교", "3학년", seoulDate(-7), "15:00", { studentLevel: "Level 2", diveClass: "화-목-금 15:00~16:10" }), status: "결과 전송 완료", rtpSkipped: true, audioSkipped: true, summary: "기초 어휘가 탄탄합니다.", consult: "독서 습관 형성 상담.", comment: "Level 2 반에서 시작합니다.", enrollmentStatus: "등록 완료", enrollmentDate: seoulDate(-5), enrollmentNote: "3월 반 배정 완료" },
];

for (const record of records) {
  const res = await fetch(`${base}/api/consultations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(record) });
  if (!res.ok) throw new Error(`상담 생성 실패 (${record.form.name}): ${res.status} ${await res.text()}`);
  console.log(`상담 생성: ${record.form.name} (${record.status})`);
}

// 최소 PDF와 1초 무음 WAV를 첨부파일로 등록
const pdf = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
const sampleRate = 8000, samples = sampleRate;
const wav = Buffer.alloc(44 + samples * 2);
wav.write("RIFF", 0); wav.writeUInt32LE(36 + samples * 2, 4); wav.write("WAVE", 8); wav.write("fmt ", 12);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);

for (const [name, type, body, category] of [["김하늘_RTP.pdf", "application/pdf", pdf, "rtp"], ["김하늘_상담.wav", "audio/wav", wav, "consultation"]]) {
  const form = new FormData();
  form.append("category", category);
  form.append("file", new Blob([body], { type }), name);
  const res = await fetch(`${base}/api/files`, { method: "POST", body: form });
  console.log(`파일 등록: ${name} → ${res.status}`);
}
console.log("완료");
