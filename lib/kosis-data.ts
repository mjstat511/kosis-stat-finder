import "server-only";

import { KosisError, kosisGet, readKosisError } from "@/lib/kosis";

const META_URL = "https://kosis.kr/openapi/statisticsData.do";
const DATA_URL = "https://kosis.kr/openapi/Param/statisticsParameterData.do";

// 가져올 시점 개수: 기본 5개, 많아도 12개까지 (DESIGN.md 흐름 B ③의 상한)
export const DEFAULT_PERIOD_COUNT = 5;
export const MAX_PERIOD_COUNT = 12;

// 분류가 "전체"를 뜻하는 이름들. 질문에서 따로 고른 값이 없을 때 기본으로 쓴다.
const TOTAL_NAMES = ["전국", "전체", "합계", "총계", "계", "소계"];

export type CodeValue = { id: string; name: string };
export type ItemValue = CodeValue & { unit: string };

// 통계표의 분류 한 단계 (예: 1단계 = 행정구역별). 수치 조회에서는 objL{level}에 해당한다.
export type Classification = {
  level: number;
  name: string;
  values: CodeValue[];
};

// KOSIS가 쓰는 수록주기 코드
export type PeriodType = "Y" | "H" | "Q" | "M" | "D" | "F" | "IR";

export type PeriodInfo = {
  type: PeriodType;
  start: string; // 수록 시작 시점 (예: "1999 3/4")
  end: string; // 수록 끝 시점 (예: "2026 2/4")
};

// 통계표의 구조: 어떤 항목, 분류, 수록주기가 있는지
export type TableMeta = {
  orgId: string;
  tblId: string;
  items: ItemValue[];
  classifications: Classification[];
  periods: PeriodInfo[];
};

// 질문에서 뽑은 힌트 (질문 분석 단계가 넘겨준다)
export type SelectionHints = {
  words?: string[]; // 지역·분류 단어 (예: ["서울"]). 어디에도 맞지 않으면 unmatchedWords로 알려 준다.
  topicWords?: string[]; // 주제 단어 (예: ["합계출산율"]). 항목·분류 이름과 맞으면 고르는 데만 쓰고, 맞지 않아도 문제로 보지 않는다.
  periodType?: PeriodType; // 원하는 수록주기 (예: 연도별이면 "Y")
  count?: number; // 가져올 시점 개수
  fromYear?: number | null; // 질문의 시작 연도 (있으면 이 기간을 가져온다)
  toYear?: number | null; // 질문의 끝 연도
};

// 고른 코드: 이 값으로 수치를 조회한다.
export type Selection = {
  item: ItemValue;
  classes: { level: number; levelName: string; value: CodeValue }[];
  periodType: PeriodType;
  periodCount: number;
  periodEnd: string; // 이 수록주기의 수록 끝 시점 (추계 자료인지 가늠하는 데 쓴다)
  fromYear: number | null; // 연도 범위로 가져올 때의 시작 연도 (없으면 최근 N개)
  toYear: number | null;
  unmatchedWords: string[]; // 어디에도 맞지 않은 힌트 (호출한 쪽이 "찾지 못함"으로 처리할지 정한다)
  guessed: string[]; // 힌트도 "전체" 값도 없어서 첫 번째 값을 임시로 고른 단계 이름 (답변에 선택한 분류를 밝혀야 한다)
};

// 조회한 수치 한 줄
export type StatRow = {
  itemName: string;
  unit: string;
  classNames: string[]; // 분류 단계별 이름 (예: ["전국"])
  period: string; // KOSIS 원래 시점 값 (예: "202602")
  periodLabel: string; // 사람이 읽는 시점 (예: "2026년 2분기")
  value: number | null; // 값이 없거나 숫자가 아니면 null
  isProjection: boolean; // 올해보다 뒤 시점이면 true (추계·전망 자료)
};

export type TableData = {
  tableName: string;
  selection: Selection;
  rows: StatRow[];
  truncated: boolean; // 범위가 넓어 최근 일부만 남겼으면 true
};

export function kosisTableUrl(orgId: string, tblId: string): string {
  return `https://kosis.kr/statHtml/statHtml.do?orgId=${encodeURIComponent(orgId)}&tblId=${encodeURIComponent(tblId)}`;
}

const PERIOD_CODES: Record<string, PeriodType> = {
  년: "Y",
  반년: "H",
  분기: "Q",
  월: "M",
  일: "D",
  다년: "F",
  부정기: "IR",
};

// 통계표의 항목·분류·수록주기 구조를 가져온다. (KOSIS 호출 2번을 동시에 한다)
export async function getTableMeta(
  orgId: string,
  tblId: string,
): Promise<TableMeta> {
  const base = { method: "getMeta", orgId, tblId };
  const [itmData, prdData] = await Promise.all([
    kosisGet(META_URL, { ...base, type: "ITM" }),
    kosisGet(META_URL, { ...base, type: "PRD" }),
  ]);

  if (!Array.isArray(itmData)) {
    readKosisError(itmData);
    throw new KosisError("request", "이 통계표의 항목·분류 정보를 찾지 못했어요. 다른 통계표로 다시 시도해 주세요.", false);
  }

  const items: ItemValue[] = [];
  const levels = new Map<number, Classification>();
  for (const row of itmData as Record<string, string | undefined>[]) {
    const id = row.ITM_ID ?? "";
    const name = row.ITM_NM ?? "";
    if (row.OBJ_ID === "ITEM") {
      items.push({ id, name, unit: row.UNIT_NM ?? "" });
      continue;
    }
    const level = Number(row.OBJ_ID_SN);
    if (!Number.isInteger(level)) continue;
    const found = levels.get(level) ?? {
      level,
      name: row.OBJ_NM ?? "",
      values: [],
    };
    found.values.push({ id, name });
    levels.set(level, found);
  }
  if (items.length === 0) {
    throw new KosisError("request", "이 통계표에서 조회할 항목을 찾지 못했어요. 다른 통계표로 다시 시도해 주세요.", false);
  }

  const periods: PeriodInfo[] = [];
  if (Array.isArray(prdData)) {
    for (const row of prdData as Record<string, string | undefined>[]) {
      const type = PERIOD_CODES[row.PRD_SE ?? ""];
      if (type) {
        periods.push({
          type,
          start: row.STRT_PRD_DE ?? "",
          end: row.END_PRD_DE ?? "",
        });
      }
    }
  } else {
    readKosisError(prdData);
  }

  return {
    orgId,
    tblId,
    items,
    classifications: [...levels.values()].sort((a, b) => a.level - b.level),
    periods,
  };
}

// 힌트 단어와 이름이 맞는 값을 찾는다. 이름이 똑같은 것을 먼저, 없으면 단어를 포함하는 가장 짧은 이름.
function matchWord<T extends CodeValue>(values: T[], rawWord: string): T | null {
  const squash = (s: string) => s.replace(/\s+/g, "");
  const word = squash(rawWord);
  const exact = values.find((v) => squash(v.name) === word);
  if (exact) return exact;
  const partial = values
    .filter((v) => {
      const name = squash(v.name);
      return name.includes(word) || (name.length >= 2 && word.includes(name));
    })
    .sort((a, b) => a.name.length - b.name.length);
  return partial[0] ?? null;
}

function pickTotal<T extends CodeValue>(values: T[]): T | null {
  for (const total of TOTAL_NAMES) {
    const found = values.find((v) => v.name === total);
    if (found) return found;
  }
  return null;
}

// 수록 끝 시점이 가장 최근인 수록주기를 고른다. (같으면 더 큰 단위: 년 → 분기 → 월 순서)
const PERIOD_ORDER: PeriodType[] = ["Y", "H", "Q", "M", "D", "F", "IR"];
function pickLatestPeriod(periods: PeriodInfo[]): PeriodType {
  const endYear = (p: PeriodInfo) => Number.parseInt(p.end.slice(0, 4), 10) || 0;
  const sorted = [...periods].sort(
    (a, b) =>
      endYear(b) - endYear(a) ||
      PERIOD_ORDER.indexOf(a.type) - PERIOD_ORDER.indexOf(b.type),
  );
  return sorted[0]?.type ?? "Y";
}

// 질문 힌트에 맞는 분류·항목·수록주기 코드를 고른다.
// 규칙: ① 힌트 단어와 이름이 맞는 값 ② 없으면 "전국·합계" 같은 전체 값 ③ 그래도 없으면 첫 번째 값
export function selectCodes(
  meta: TableMeta,
  hints: SelectionHints = {},
): Selection {
  const words = (hints.words ?? []).map((w) => w.trim()).filter(Boolean);
  const topicWords = (hints.topicWords ?? []).map((w) => w.trim()).filter(Boolean);
  const used = new Set<string>();
  const guessed: string[] = [];

  function pick<T extends CodeValue>(
    values: T[],
    levelName: string,
    fallbackTotal: boolean,
  ): T {
    for (const word of words) {
      const match = matchWord(values, word);
      if (match) {
        used.add(word);
        return match;
      }
    }
    for (const word of topicWords) {
      const match = matchWord(values, word);
      if (match) return match;
    }
    const total = fallbackTotal ? pickTotal(values) : null;
    if (total) return total;
    // 고를 근거가 없는데 선택지가 여럿이면 첫 번째 값을 임시로 쓰고 기록해 둔다.
    if (values.length > 1) guessed.push(levelName);
    return values[0];
  }

  const item = pick(meta.items, "항목", false);
  const classes = meta.classifications.map((c) => ({
    level: c.level,
    levelName: c.name,
    value: pick(c.values, c.name, true),
  }));

  // 원하는 수록주기가 있어도 질문의 끝 연도까지 자료가 없으면(예: 연도별은 작년까지) 가장 최근까지 있는 주기로 바꾼다.
  const wanted = hints.periodType;
  const wantedInfo = meta.periods.find((p) => p.type === wanted);
  const wantedEnd = Number.parseInt(wantedInfo?.end.slice(0, 4) ?? "", 10) || 0;
  const periodType =
    wanted && wantedInfo && (!hints.toYear || wantedEnd >= hints.toYear)
      ? wanted
      : pickLatestPeriod(meta.periods);
  const periodCount = Math.min(
    Math.max(Math.trunc(hints.count ?? DEFAULT_PERIOD_COUNT), 1),
    MAX_PERIOD_COUNT,
  );

  return {
    item,
    classes,
    periodType,
    periodCount,
    periodEnd: meta.periods.find((p) => p.type === periodType)?.end ?? "",
    fromYear: hints.fromYear ?? null,
    toYear: hints.toYear ?? null,
    unmatchedWords: words.filter((w) => !used.has(w)),
    guessed,
  };
}

// KOSIS가 주는 시점 값을 사람이 읽는 말로 바꾼다. (예: 분기 "202602" → "2026년 2분기")
export function formatPeriod(type: PeriodType, raw: string): string {
  const year = raw.slice(0, 4);
  const rest = raw.slice(4);
  switch (type) {
    case "Y":
      return `${year}년`;
    case "H":
      return `${year}년 ${rest === "01" ? "상반기" : "하반기"}`;
    case "Q":
      return `${year}년 ${Number(rest)}분기`;
    case "M":
      return `${year}년 ${Number(rest)}월`;
    case "D":
      return `${year}년 ${Number(raw.slice(4, 6))}월 ${Number(raw.slice(6, 8))}일`;
    default:
      return raw;
  }
}

// 연도 범위를 수록주기에 맞는 KOSIS 시점 형식으로 바꾼다. (예: 분기 2024~2025 → 202401, 202504)
// 연도 범위가 없거나 이 수록주기로 만들 수 없으면 null이다.
function yearRange(selection: Selection): { start: string; end: string } | null {
  const { fromYear, toYear, periodType } = selection;
  if (fromYear === null && toYear === null) return null;
  const endYear = Number.parseInt(selection.periodEnd.slice(0, 4), 10) || new Date().getFullYear();
  const from = fromYear ?? (toYear as number) - MAX_PERIOD_COUNT + 1;
  const to = toYear ?? Math.min(endYear, new Date().getFullYear());
  const tails: Partial<Record<PeriodType, [string, string]>> = {
    Y: ["", ""],
    H: ["01", "02"],
    Q: ["01", "04"],
    M: ["01", "12"],
  };
  const tail = tails[periodType];
  if (!tail) return null;
  return { start: `${from}${tail[0]}`, end: `${to}${tail[1]}` };
}

// 고른 코드로 수치를 가져온다. 결과가 없으면 rows가 빈 배열이다.
export async function fetchStatData(
  orgId: string,
  tblId: string,
  selection: Selection,
): Promise<{ tableName: string; rows: StatRow[]; truncated: boolean }> {
  // 수록 끝이 올해보다 뒤(추계 자료)면, 올해까지의 실제 자료를 얻으려고 그만큼 더 받은 뒤 걸러낸다.
  const thisYear = new Date().getFullYear();
  const endYear = Number.parseInt(selection.periodEnd.slice(0, 4), 10) || 0;
  const perYear = { Y: 1, H: 2, Q: 4, M: 12, D: 366, F: 1, IR: 1 }[selection.periodType];
  const extra = endYear > thisYear ? (endYear - thisYear) * perYear : 0;
  const params: Record<string, string> = {
    method: "getList",
    orgId,
    tblId,
    itmId: selection.item.id,
    prdSe: selection.periodType,
  };
  const range = yearRange(selection);
  if (range) {
    // 질문이 연도 범위를 말했으면 그 기간을 가져온다.
    params.startPrdDe = range.start;
    params.endPrdDe = range.end;
  } else {
    params.newEstPrdCnt = String(selection.periodCount + extra);
  }
  for (const c of selection.classes) {
    params[`objL${c.level}`] = c.value.id;
  }

  const data = await kosisGet(DATA_URL, params);
  if (!Array.isArray(data)) {
    readKosisError(data);
    return { tableName: "", rows: [], truncated: false };
  }

  const raws = data as Record<string, string | undefined>[];
  const rows = raws
    .map((row) => {
      const period = row.PRD_DE ?? "";
      const raw = (row.DT ?? "").replace(/,/g, "").trim();
      const value = raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null;
      const classNames = selection.classes.map(
        (c) => row[`C${c.level}_NM`] ?? c.value.name,
      );
      return {
        itemName: row.ITM_NM ?? selection.item.name,
        unit: row.UNIT_NM ?? selection.item.unit,
        classNames,
        period,
        periodLabel: formatPeriod(selection.periodType, period),
        value,
        isProjection: Number.parseInt(period.slice(0, 4), 10) > thisYear,
      };
    })
    .sort((a, b) => a.period.localeCompare(b.period));

  // 실제 자료가 있으면 추계 시점은 빼고 최근 개수만 남긴다. 전부 추계 자료면 그대로 둔다.
  const observed = rows.filter((r) => !r.isProjection);
  const usable = observed.length > 0 ? observed : rows;
  // 연도 범위로 가져왔으면 최대 12개까지, 아니면 요청한 개수만 남긴다.
  const limit = range ? MAX_PERIOD_COUNT : selection.periodCount;
  const kept = usable.slice(-limit);
  return {
    tableName: raws[0]?.TBL_NM ?? "",
    rows: kept,
    truncated: kept.length < usable.length,
  };
}

// 통계표 구조 조회 → 코드 고르기 → 수치 조회를 한 번에 한다.
export async function getTableData(
  orgId: string,
  tblId: string,
  hints: SelectionHints = {},
): Promise<TableData> {
  const meta = await getTableMeta(orgId, tblId);
  const selection = selectCodes(meta, hints);
  const { tableName, rows, truncated } = await fetchStatData(orgId, tblId, selection);
  return { tableName, selection, rows, truncated };
}
