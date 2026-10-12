import { toErrorResponse, errorBody } from "@/lib/api-error";
import { buildAnswer } from "@/lib/answer";
import { runWithDeadline } from "@/lib/deadline";
import { checkRateLimit, clientKey, limitResponse } from "@/lib/rate-limit";
import { checkQuestion } from "@/lib/question-analysis";
import { AnswerRequestSchema, type AnswerRequest, type AnswerResponse } from "@/lib/schemas";

// 답변 API (DESIGN.md 흐름 B). 배포 때 Vercel 요금제 한도를 확인해 값을 조정한다.
export const maxDuration = 60;

// 요청 하나가 쓸 수 있는 전체 시간. 플랫폼이 함수를 강제로 끊기 전에 우리가 먼저 "지연" 오류로 끝낸다.
const REQUEST_BUDGET_MS = 55_000;

// 같은 사용자(IP)의 호출 횟수 제한. (비용 보호)
const RATE_RULES = [
  { name: "answer-min", windowMs: 60_000, max: 30 },
  { name: "answer-hour", windowMs: 3_600_000, max: 250 },
];

export async function POST(req: Request): Promise<Response> {
  const parsed = AnswerRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(errorBody("요청 형식이 올바르지 않아요.", false), { status: 400 });
  }

  let question: string;
  try {
    question = checkQuestion(parsed.data.question);
  } catch (e) {
    return Response.json(errorBody((e as Error).message, false), { status: 400 });
  }

  const limit = checkRateLimit(clientKey(req), RATE_RULES);
  if (!limit.ok) return limitResponse(limit.retryAfterSec);

  return runWithDeadline(REQUEST_BUDGET_MS, () => handle({ ...parsed.data, question }));
}

async function handle(input: AnswerRequest): Promise<Response> {
  try {
    const result = await buildAnswer(input);

    if (result.kind === "notFound") {
      const body: AnswerResponse = { status: "notFound", message: result.message, altKeywords: [] };
      return Response.json(body);
    }
    if (result.kind === "unverified") {
      // 서버 검사를 모두 통과하지 못했으면 수치 없이 실패를 알린다. 문제 목록은 서버 로그에만 남긴다. (질문 원문은 없음)
      console.error("[api/answer] 검사 실패:", result.problems.join(" / "));
      return Response.json(
        errorBody("수치를 확인하지 못해 답변을 드릴 수 없어요. 다시 시도해 주세요.", true),
        { status: 502 },
      );
    }
    const body: AnswerResponse = {
      status: "answer",
      sentences: result.sentences,
      source: result.source,
      period: result.period,
      calculations: result.calculations,
      data: result.data,
      truncated: result.truncated,
    };
    return Response.json(body);
  } catch (e) {
    return toErrorResponse(e, "api/answer");
  }
}
