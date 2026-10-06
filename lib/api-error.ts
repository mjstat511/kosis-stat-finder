import "server-only";

import { KosisError } from "@/lib/kosis";
import { AiCallError } from "@/lib/openai";

export const KOSIS_HOME = "https://kosis.kr";

export type ErrorBody = {
  status: "error";
  message: string;
  retryable: boolean;
  kosisUrl: string;
};

export function errorBody(message: string, retryable: boolean): ErrorBody {
  return { status: "error", message, retryable, kosisUrl: KOSIS_HOME };
}

// 오류를 사용자에게 보여줘도 되는 응답으로 바꾼다. (질문 원문은 로그에 남기지 않는다)
// 보여줘도 되는 것: AI 호출 오류와 KOSIS 오류(둘 다 우리가 만든 한국어 안내만 담는다). 그 밖은 일반 문구로 바꾼다.
// 시간 초과(지연)는 504, 그 밖의 외부 서비스 문제는 502로 돌려준다.
export function toErrorResponse(e: unknown, tag: string): Response {
  if (e instanceof AiCallError || e instanceof KosisError) {
    const status = e.kind === "timeout" ? 504 : 502;
    return Response.json(errorBody(e.message, e.retryable), { status });
  }
  console.error(`[${tag}]`, e instanceof Error ? `${e.name}: ${e.message}` : "알 수 없는 오류");
  return Response.json(
    errorBody("일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.", true),
    { status: 500 },
  );
}
