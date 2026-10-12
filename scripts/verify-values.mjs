// 답변 수치가 KOSIS 원본과 같은지 자동으로 대조하는 스크립트.
// 사용: node scripts/verify-values.mjs [서버 주소, 기본 https://kosis-stat-finder.vercel.app]
//
// 방법: 테스트 질문마다 앱에 질문해 답변(근거 수치)을 받고, 앱 코드를 거치지 않고
//       KOSIS 원본 API를 따로 불러 같은 시점·같은 분류의 값과 글자 그대로 비교한다.
//       (분류 코드는 앱이 고른 것을 믿지 않고, 답변에 적힌 분류 "이름"으로 KOSIS 메타 정보에서 다시 찾는다.)
// 읽는 곳: docs/test-questions.md, .env(KOSIS_API_KEY)   쓰는 곳: docs/value-check.md
import { readFile, writeFile } from "node:fs/promises";

const BASE = process.argv[2] ?? "https://kosis-stat-finder.vercel.app";
const META_URL = "https://kosis.kr/openapi/statisticsData.do";
const DATA_URL = "https://kosis.kr/openapi/Param/statisticsParameterData.do";

const env = await readFile(".env", "utf-8");
const KOSIS_KEY = env.match(/^\s*KOSIS_API_KEY=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!KOSIS_KEY) throw new Error(".env에 KOSIS_API_KEY가 없습니다.");

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  return res.json();
}

async function kosis(url, params) {
  const q = new URLSearchParams({ ...params, apiKey: KOSIS_KEY, format: "json", jsonVD: "Y" });
  const res = await fetch(`${url}?${q}`, { signal: AbortSignal.timeout(60_000) });
  return res.json();
}

// "2025년 3분기" → { se: "Q", prd: "202503" } 처럼 답변의 시점 이름을 KOSIS 시점 값으로 바꾼다.
function toKosisPeriod(label) {
  let m;
  if ((m = label.match(/^(\d{4})년 (\d)분기$/))) return { se: "Q", prd: `${m[1]}0${m[2]}` };
  if ((m = label.match(/^(\d{4})년 (\d{1,2})월$/))) return { se: "M", prd: `${m[1]}${m[2].padStart(2, "0")}` };
  if ((m = label.match(/^(\d{4})년 (상반기|하반기)$/))) return { se: "H", prd: `${m[1]}0${m[2] === "상반기" ? 1 : 2}` };
  if ((m = label.match(/^(\d{4})년$/))) return { se: "Y", prd: m[1] };
  return null;
}

const metaCache = new Map();
async function getMeta(orgId, tblId) {
  const key = `${orgId}/${tblId}`;
  if (!metaCache.has(key)) {
    const raw = await kosis(META_URL, { method: "getMeta", type: "ITM", orgId, tblId });
    if (!Array.isArray(raw)) throw new Error(`메타 조회 실패: ${JSON.stringify(raw)}`);
    const levels = new Map();
    for (const r of raw) {
      if (r.OBJ_ID === "ITEM") continue;
      const lv = Number(r.OBJ_ID_SN);
      if (!levels.has(lv)) levels.set(lv, []);
      levels.get(lv).push({ id: r.ITM_ID, name: r.ITM_NM });
    }
    metaCache.set(key, [...levels.entries()].sort((a, b) => a[0] - b[0]));
  }
  return metaCache.get(key);
}

const norm = (s) => String(s).replace(/\s+/g, "");
const toNum = (s) => Number(String(s).replace(/,/g, "").trim());

// 답변 하나를 KOSIS 원본과 대조한다. 결과: { verdict, rows, detail }
async function verifyAnswer(orgId, tblId, answer) {
  const rows = answer.data ?? [];
  if (rows.length === 0) return { verdict: "대조 불가", rows: 0, detail: "답변에 근거 수치가 없음" };

  const levels = await getMeta(orgId, tblId);
  const periods = rows.map((r) => toKosisPeriod(r.periodLabel));
  if (periods.some((p) => !p)) return { verdict: "대조 불가", rows: rows.length, detail: "시점 형식을 읽지 못함" };
  const se = periods[0].se;
  const prds = periods.map((p) => p.prd).sort();

  // 분류 이름 → KOSIS 코드 (앱이 고른 코드는 쓰지 않는다)
  const first = rows[0].classNames;
  const params = { method: "getList", orgId, tblId, itmId: "ALL", prdSe: se, startPrdDe: prds[0], endPrdDe: prds[prds.length - 1] };
  const codeByLevel = [];
  for (let i = 0; i < levels.length; i++) {
    const [lv, values] = levels[i];
    const name = first[i];
    const found = values.filter((v) => norm(v.name) === norm(name));
    if (found.length === 0) return { verdict: "대조 불가", rows: rows.length, detail: `분류 이름 '${name}'을 KOSIS 메타에서 못 찾음` };
    params[`objL${lv}`] = found[0].id;
    codeByLevel.push(found[0].id);
  }

  const raw = await kosis(DATA_URL, params);
  if (!Array.isArray(raw)) return { verdict: "대조 불가", rows: rows.length, detail: `KOSIS 조회 실패: ${JSON.stringify(raw).slice(0, 80)}` };

  const mismatches = [];
  const itemNames = new Set();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const same = raw.filter((k) => k.PRD_DE === periods[i].prd);
    const equal = same.filter((k) => toNum(k.DT) === r.value);
    if (equal.length === 0) {
      mismatches.push(`${r.periodLabel}: 답변 ${r.value}, 원본 ${same.map((k) => `${k.ITM_NM}=${k.DT}`).join(" / ") || "(해당 시점 없음)"}`);
    } else {
      for (const k of equal) itemNames.add(k.ITM_NM);
    }
  }
  if (mismatches.length > 0) return { verdict: "불일치", rows: rows.length, detail: mismatches.join(" ; ") };
  return { verdict: "일치", rows: rows.length, detail: `원본 항목: ${[...itemNames].join(", ")}` };
}

// 문장 속 숫자가 근거 수치나 계산 결과에 있는지 (연도·시점·단위 숫자는 뺀다). 사람이 볼 참고용이다.
function sentenceNumbersNotInData(answer) {
  const text = answer.sentences.join(" ").replace(/\d{4}년/g, " ").replace(/\d{1,2}월/g, " ").replace(/\d분기/g, " ");
  const found = (text.replace(/(\d),(?=\d{3})/g, "$1").match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  const allowed = new Set((answer.data ?? []).map((d) => d.value));
  for (const c of answer.calculations ?? []) {
    for (const n of c.match(/-?\d+(?:\.\d+)?/g) ?? []) allowed.add(Number(n));
  }
  return found.filter((n) => ![...allowed].some((a) => Math.abs(Math.abs(a) - n) < 1e-9));
}

const md = await readFile("docs/test-questions.md", "utf-8");
const questions = md
  .split("\n")
  .map((line) => line.split("|").map((c) => c.trim()))
  .filter((c) => /^\d+$/.test(c[1] ?? ""))
  .map((c) => ({ no: Number(c[1]), question: c[2], answers: c[3].split(",").map((s) => s.trim()) }));

const results = [];
for (const q of questions) {
  let search = await post("/api/search", { question: q.question });
  if (search.status === "clarify") search = await post("/api/search", { question: q.question, clarification: search.options[0] });
  const out = { ...q, verdict: "대조 불가", rows: 0, detail: "", table: "", extra: [] };

  if (search.status !== "candidates") {
    out.detail = `후보를 못 찾음(${search.status})`;
  } else {
    const top3 = search.candidates.slice(0, 3);
    const pick = top3.find((c) => q.answers.includes(c.tblId)) ?? top3[0];
    out.table = `${pick.tblName} (${pick.tblId})`;
    const ans = await post("/api/answer", {
      question: search.contextualQuestion,
      orgId: pick.orgId,
      tblId: pick.tblId,
      hints: search.hints,
    });
    if (ans.status !== "answer") {
      out.detail = `답변이 나오지 않음(${ans.status}: ${ans.message ?? ""})`;
    } else {
      try {
        Object.assign(out, await verifyAnswer(pick.orgId, pick.tblId, ans));
      } catch (e) {
        out.detail = `대조 중 오류: ${e.message}`;
      }
      out.extra = sentenceNumbersNotInData(ans);
      out.period = ans.period;
    }
  }
  results.push(out);
  console.log(`${q.no}. ${out.verdict} | ${out.rows}건 | ${q.question}${out.verdict === "일치" ? "" : ` → ${out.detail}`}`);
}

const ok = results.filter((r) => r.verdict === "일치");
const bad = results.filter((r) => r.verdict === "불일치");
const na = results.filter((r) => r.verdict === "대조 불가");
const cells = ok.reduce((s, r) => s + r.rows, 0);

const lines = [
  "# 수치 대조 결과",
  "",
  `- 실행: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · 서버 ${BASE}`,
  "- 방법: 질문 20개를 앱에 던져 받은 답변의 근거 수치를, 앱 코드를 거치지 않고 KOSIS 원본 API를 따로 불러 같은 시점·같은 분류의 값과 비교했습니다. 분류 코드는 답변에 적힌 이름으로 KOSIS 메타 정보에서 다시 찾았고, 값은 글자 그대로(반올림 없이) 같은지 봤습니다.",
  `- 결과: **일치 ${ok.length} / 불일치 ${bad.length} / 대조 불가 ${na.length}** (일치한 근거 수치 ${cells}개)`,
  "",
  "| 번호 | 질문 | 사용한 통계표 | 근거 수치 | 판정 | 비고 |",
  "|---|---|---|---|---|---|",
  ...results.map(
    (r) => `| ${r.no} | ${r.question} | ${r.table || "-"} | ${r.rows}개 | ${r.verdict} | ${r.detail}${r.extra.length ? ` · 문장 속 숫자 ${r.extra.join(", ")}은(는) 근거 수치·계산식에 없음(확인 필요)` : ""} |`,
  ),
  "",
];
await writeFile("docs/value-check.md", lines.join("\n"), "utf-8");
console.log(`\n일치 ${ok.length}, 불일치 ${bad.length}, 대조 불가 ${na.length} → docs/value-check.md`);
