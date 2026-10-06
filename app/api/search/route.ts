import { selectCandidates } from "@/lib/candidates";
import { searchKosisTables } from "@/lib/kosis";
import { AiCallError } from "@/lib/openai";
import { analyzeQuestion } from "@/lib/question-analysis";
import { SearchRequestSchema, type SearchResponse } from "@/lib/schemas";

// 후보 찾기 API (DESIGN.md 흐름 A). 배포 때 Vercel 요금제 한도를 확인해 값을 조정한다.
export const maxDuration = 60;

const KOSIS_HOME = "https://kosis.kr";
const SEARCH_RESULT_COUNT = 10;

function errorResponse(
  message: string,
  retryable: boolean,
  httpStatus: number,
): Response {
  const body: SearchResponse = { status: "error", message, retryable, kosisUrl: KOSIS_HOME };
  return Response.json(body, { status: httpStatus });
}

// 사용자에게 보여줘도 되는 오류 문구만 골라낸다. 그 밖의 내부 오류는 일반 문구로 바꾼다.
function toErrorResponse(e: unknown): Response {
  if (e instanceof AiCallError) return errorResponse(e.message, e.retryable, 502);
  if (e instanceof Error && e.message.startsWith("KOSIS")) {
    return errorResponse(e.message, true, 502);
  }
  // 질문 원문은 로그에 남기지 않고 오류 이름과 메시지만 남긴다.
  console.error("[api/search]", e instanceof Error ? `${e.name}: ${e.message}` : "알 수 없는 오류");
  return errorResponse("일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.", true, 500);
}

export async function POST(req: Request): Promise<Response> {
  const parsed = SearchRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse("요청 형식이 올바르지 않아요.", false, 400);
  }

  try {
    // ② 질문 분석 (비었거나 200자를 넘으면 여기서 한국어 안내로 거절된다)
    const analysis = await analyzeQuestion(parsed.data).catch((e: unknown) => {
      if (e instanceof Error && !(e instanceof AiCallError) && /^질문/.test(e.message)) {
        return e; // 입력 문제는 400으로 돌려보낸다
      }
      throw e;
    });
    if (analysis instanceof Error) return errorResponse(analysis.message, false, 400);

    // 통계와 무관한 질문
    if (!analysis.isStatQuestion) {
      const body: SearchResponse = {
        status: "notFound",
        message: "통계와 관련된 질문을 입력해 주세요. 예: 청년 실업률 추이",
        altKeywords: [],
      };
      return Response.json(body);
    }

    // ③ 예측·전망 요청은 거절
    if (analysis.isPrediction) {
      const body: SearchResponse = {
        status: "refused",
        message: "예측은 도와드리지 않아요. 지금까지 발표된 통계를 바탕으로 한 질문을 해 주세요.",
      };
      return Response.json(body);
    }

    // ④ KOSIS 통합검색
    const tables = await searchKosisTables(analysis.searchQuery, SEARCH_RESULT_COUNT);

    // ⑥⑦ 후보 선별과 서버 검사
    const candidates = await selectCandidates(analysis, tables);
    if (candidates.length === 0) {
      const body: SearchResponse = {
        status: "notFound",
        message: "관련 통계표를 찾지 못했어요.",
        altKeywords: analysis.altKeywords,
      };
      return Response.json(body);
    }

    const body: SearchResponse = {
      status: "candidates",
      candidates,
      contextualQuestion: analysis.contextualQuestion,
    };
    return Response.json(body);
  } catch (e) {
    return toErrorResponse(e);
  }
}
