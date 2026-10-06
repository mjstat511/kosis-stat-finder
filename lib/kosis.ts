import "server-only";

import { getServerEnv } from "@/lib/env";

const SEARCH_URL = "https://kosis.kr/openapi/statisticsSearch.do";
// 호출 하나의 제한 시간 (DESIGN.md 2번 "시간 제한": KOSIS 10초)
const TIMEOUT_MS = 10_000;

export type KosisErrorKind = "timeout" | "config" | "request" | "limit" | "server";

// 화면에 그대로 보여줘도 되는 한국어 안내만 담은 KOSIS 오류 (키나 주소는 넣지 않는다)
export class KosisError extends Error {
  constructor(
    public kind: KosisErrorKind,
    message: string,
    public retryable: boolean,
  ) {
    super(message);
    this.name = "KosisError";
  }
}

// KOSIS 통합검색 결과 중 이 앱에서 쓰는 통계표 정보
export type KosisTable = {
  orgId: string; // 기관 ID (수치 조회에 필요)
  tblId: string; // 통계표 ID (수치 조회에 필요)
  tblName: string; // 통계표 이름
  statName: string; // 통계 이름 (예: 경제활동인구조사)
  orgName: string; // 제공 기관
  category: string; // 주제 분류 경로
  description: string; // 통계표에 담긴 항목 설명 (길면 잘라 둔다)
  startPeriod: string; // 수록 시작 시점
  endPeriod: string; // 수록 끝 시점
  url: string; // KOSIS에서 이 통계표를 볼 수 있는 주소
};

type RawKosisTable = Record<string, string | undefined>;

const DESCRIPTION_MAX = 200;

function toKosisTable(raw: RawKosisTable): KosisTable {
  const description = raw.CONTENTS ?? "";
  return {
    orgId: raw.ORG_ID ?? "",
    tblId: raw.TBL_ID ?? "",
    tblName: raw.TBL_NM ?? "",
    statName: raw.STAT_NM ?? "",
    orgName: raw.ORG_NM ?? "",
    category: raw.MT_ATITLE ?? "",
    description:
      description.length > DESCRIPTION_MAX
        ? `${description.slice(0, DESCRIPTION_MAX)}…`
        : description,
    startPeriod: raw.STRT_PRD_DE ?? "",
    endPeriod: raw.END_PRD_DE ?? "",
    url: (raw.LINK_URL ?? "").replace(/^http:\/\//, "https://"),
  };
}

// KOSIS 주소로 요청을 보내 결과(JSON)를 돌려준다. 검색과 수치 조회가 함께 쓴다.
// 키는 여기서 붙이며, 오류 메시지에는 주소(키가 들어 있다)를 넣지 않는다.
export async function kosisGet(
  url: string,
  params: Record<string, string>,
  timeoutMs = TIMEOUT_MS,
): Promise<unknown> {
  const query = new URLSearchParams({
    ...params,
    apiKey: getServerEnv("KOSIS_API_KEY"),
    format: "json",
    jsonVD: "Y",
  });

  let res: Response;
  try {
    res = await fetch(`${url}?${query}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new KosisError("timeout", "KOSIS 응답이 늦어요. 잠시 후 다시 시도해 주세요.", true);
    }
    throw new KosisError("server", "KOSIS에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", true);
  }
  if (!res.ok) {
    throw new KosisError("server", `KOSIS가 응답하지 못했어요. 잠시 후 다시 시도해 주세요. (HTTP ${res.status})`, true);
  }
  try {
    return await res.json();
  } catch {
    // JSON이 아닌 응답(점검 안내 페이지 등)
    throw new KosisError("server", "KOSIS 응답을 읽지 못했어요. 잠시 후 다시 시도해 주세요.", true);
  }
}

// 오류나 결과 없음은 배열이 아니라 {err, errMsg} 객체로 온다.
// 결과 없음(코드 30)이면 null, 그 밖의 오류는 사용자가 이해할 한국어 오류(KosisError)로 바꾼다.
// KOSIS가 보낸 영어·내부 문구(errMsg)는 화면에 내보내지 않고, 코드만 서버 로그에서 확인할 수 있게 둔다.
export function readKosisError(data: unknown): null {
  const { err, errMsg } = (data ?? {}) as { err?: string; errMsg?: string };
  if (err === "30") return null;
  console.error("[kosis] 오류 응답:", err ?? "?", errMsg ?? "");

  const code = Number(err);
  if (code >= 10 && code <= 12) {
    throw new KosisError("config", "KOSIS 연결 설정에 문제가 있어요. 관리자에게 알려 주세요.", false);
  }
  if (code === 20 || code === 21) {
    throw new KosisError("request", "KOSIS가 이 요청을 처리하지 못했어요. 다른 통계표로 다시 시도해 주세요.", false);
  }
  if (code === 31) {
    throw new KosisError("request", "조회할 자료가 너무 많아요. 기간이나 조건을 좁혀 질문해 주세요.", false);
  }
  if (code >= 40 && code <= 42) {
    throw new KosisError("limit", "KOSIS 이용량이 많아요. 잠시 후 다시 시도해 주세요.", true);
  }
  throw new KosisError("server", "KOSIS에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요.", true);
}

// 키워드로 KOSIS 통계표를 검색한다. 결과가 없으면 빈 배열을 돌려준다.
// 오류 메시지에는 주소(키가 들어 있다)를 넣지 않는다.
export async function searchKosisTables(
  keyword: string,
  limit = 10,
): Promise<KosisTable[]> {
  const searchNm = keyword.trim();
  if (!searchNm) {
    throw new Error("검색어가 비어 있습니다.");
  }

  const data = await kosisGet(SEARCH_URL, {
    method: "getList",
    searchNm,
    sort: "RANK",
    startCount: "1",
    resultCount: String(limit),
  });

  if (!Array.isArray(data)) {
    return readKosisError(data) ?? [];
  }

  return (data as RawKosisTable[]).map(toKosisTable);
}
