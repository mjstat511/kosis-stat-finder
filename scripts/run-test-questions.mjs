// 테스트 질문을 실제 앱(개발 서버)에 던져 성공 기준을 재는 스크립트.
// 사용: node scripts/run-test-questions.mjs [서버 주소, 기본 http://localhost:3001]
// 읽는 곳: docs/test-questions.md   쓰는 곳: docs/test-results.md
import { readFile, writeFile } from "node:fs/promises";

const BASE = process.argv[2] ?? "http://localhost:3001";
const ONE_MINUTE_MS = 60_000;

async function post(path, body) {
  const t0 = Date.now();
  try {
    const res = await fetch(BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    return { data: await res.json(), ms: Date.now() - t0 };
  } catch (e) {
    return { data: { status: "error", message: String(e.message ?? e) }, ms: Date.now() - t0 };
  }
}

// 마크다운 표에서 질문을 읽는다.
const md = await readFile("docs/test-questions.md", "utf-8");
const questions = md
  .split("\n")
  .map((line) => line.split("|").map((c) => c.trim()))
  .filter((c) => /^\d+$/.test(c[1] ?? ""))
  .map((c) => ({ no: Number(c[1]), question: c[2], answers: c[3].split(",").map((s) => s.trim()) }));

const results = [];
for (const q of questions) {
  let search = await post("/api/search", { question: q.question });
  let searchMs = search.ms;
  let clarified = null;
  if (search.data.status === "clarify") {
    // 되물으면 첫 번째 선택지를 고른다. 걸린 시간은 두 번 모두 더한다.
    clarified = search.data.options[0];
    search = await post("/api/search", { question: q.question, clarification: clarified });
    searchMs += search.ms;
  }

  const row = {
    ...q,
    status: search.data.status,
    clarified,
    searchMs,
    candidates: (search.data.candidates ?? []).map((c) => `${c.tblName} (${c.tblId})`),
    hit: false,
    answer: null,
  };

  if (search.data.status === "candidates") {
    const top3 = search.data.candidates.slice(0, 3);
    const hitCandidate = top3.find((c) => q.answers.includes(c.tblId));
    row.hit = Boolean(hitCandidate);
    // 맞는 후보가 있으면 그 표로, 없으면 1순위로 답변을 받아 본다.
    const pick = hitCandidate ?? top3[0];
    const ans = await post("/api/answer", {
      question: search.data.contextualQuestion,
      orgId: pick.orgId,
      tblId: pick.tblId,
      hints: search.data.hints,
    });
    row.answer = {
      status: ans.data.status,
      ms: ans.ms,
      table: pick.tblName,
      period: ans.data.period ?? "",
      text: (ans.data.sentences ?? [ans.data.message ?? ""]).join(" "),
      values: (ans.data.data ?? []).map((d) => `${d.periodLabel}=${d.value}${d.unit}`).join(", "),
    };
  } else {
    row.note = search.data.message ?? "";
  }
  results.push(row);
  console.log(
    `${q.no}. ${row.hit ? "적중" : "미적중"} | 검색 ${(searchMs / 1000).toFixed(1)}초 | ${row.status}${clarified ? `(되묻기→${clarified})` : ""} | ${q.question}`,
  );
}

// 결과 요약
const hits = results.filter((r) => r.hit).length;
const within = results.filter((r) => r.searchMs <= ONE_MINUTE_MS).length;
const answered = results.filter((r) => r.answer?.status === "answer").length;
const avg = results.reduce((s, r) => s + r.searchMs, 0) / results.length / 1000;
const max = Math.max(...results.map((r) => r.searchMs)) / 1000;

const lines = [
  "# 테스트 결과",
  "",
  `- 실행: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · 서버 ${BASE}`,
  `- 첫 3개 안 적중: **${hits} / ${results.length}** (${Math.round((hits / results.length) * 100)}%) — 목표 16개(80%) 이상`,
  `- 검색 1분 이내: **${within} / ${results.length}** (평균 ${avg.toFixed(1)}초, 최대 ${max.toFixed(1)}초) — 목표 전부`,
  `- 답변이 나온 질문: **${answered} / ${results.length}**`,
  "- 수치 일치(KOSIS 화면과 대조)는 사람이 직접 확인해 아래 표의 마지막 칸에 적습니다.",
  "",
  "| 번호 | 질문 | 적중 | 검색(초) | 되묻기 | 답변 | 기준 시점 | 수치 대조 |",
  "|---|---|---|---|---|---|---|---|",
  ...results.map(
    (r) =>
      `| ${r.no} | ${r.question} | ${r.hit ? "○" : "×"} | ${(r.searchMs / 1000).toFixed(1)} | ${r.clarified ?? "-"} | ${r.answer?.status ?? r.status} | ${r.answer?.period || "-"} |  |`,
  ),
  "",
  "## 질문별 상세",
  "",
  ...results.flatMap((r) => [
    `### ${r.no}. ${r.question}`,
    `- 정답: ${r.answers.join(", ")}`,
    `- 후보: ${r.candidates.length > 0 ? r.candidates.join(" / ") : `(없음) ${r.note ?? r.status}`}`,
    ...(r.answer
      ? [
          `- 답변에 쓴 표: ${r.answer.table} · 상태 ${r.answer.status} · ${(r.answer.ms / 1000).toFixed(1)}초`,
          `- 근거 수치: ${r.answer.values || "-"}`,
          `- 답변: ${r.answer.text}`,
        ]
      : []),
    "",
  ]),
];
await writeFile("docs/test-results.md", lines.join("\n"), "utf-8");
console.log(`\n적중 ${hits}/${results.length}, 1분 이내 ${within}/${results.length}, 답변 ${answered}/${results.length} → docs/test-results.md`);
