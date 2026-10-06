import { selectCandidates } from "@/lib/candidates";
import { searchKosisTables } from "@/lib/kosis";
import { AiCallError } from "@/lib/openai";
import { errorBody, toErrorResponse } from "@/lib/api-error";
import { analyzeQuestion, toAnswerHints } from "@/lib/question-analysis";
import { SearchRequestSchema, type SearchResponse } from "@/lib/schemas";

// 후보 찾기 API (DESIGN.md 흐름 A). 배포 때 Vercel 요금제 한도를 확인해 값을 조정한다.
export const maxDuration = 60;

const SEARCH_RESULT_COUNT = 10;

function badRequest(message: string): Response {
  return Response.json(errorBody(message, false), { status: 400 });
}

export async function POST(req: Request): Promise<Response> {
  const parsed = SearchRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return badRequest("요청 형식이 올바르지 않아요.");
  }

  try {
    // ② 질문 분석 (비었거나 200자를 넘으면 여기서 한국어 안내로 거절된다)
    const analysis = await analyzeQuestion(parsed.data).catch((e: unknown) => {
      if (e instanceof Error && !(e instanceof AiCallError) && /^질문/.test(e.message)) {
        return e; // 입력 문제는 400으로 돌려보낸다
      }
      throw e;
    });
    if (analysis instanceof Error) return badRequest(analysis.message);

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

    // ④ KOSIS 통합검색 → ⑥⑦ 후보 선별과 서버 검사
    const alreadyClarified = Boolean(parsed.data.clarification); // 이미 되물은 뒤면 다시 되묻지 않는다
    let tables = await searchKosisTables(analysis.searchQuery, SEARCH_RESULT_COUNT);
    let { candidates, clarify } = await selectCandidates(analysis, tables, alreadyClarified);

    // KOSIS 검색은 "가구 수"와 "가구수"를 다르게 본다. 못 찾았으면 띄어쓰기를 없앤 검색어로 한 번 더 찾는다.
    const squashed = analysis.searchQuery.replace(/\s+/g, "");
    if (candidates.length === 0 && !clarify && squashed !== analysis.searchQuery) {
      tables = await searchKosisTables(squashed, SEARCH_RESULT_COUNT);
      ({ candidates, clarify } = await selectCandidates(analysis, tables, alreadyClarified));
    }
    if (clarify) {
      const body: SearchResponse = { status: "clarify", ...clarify };
      return Response.json(body);
    }
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
      hints: toAnswerHints(analysis),
    };
    return Response.json(body);
  } catch (e) {
    return toErrorResponse(e, "api/search");
  }
}
