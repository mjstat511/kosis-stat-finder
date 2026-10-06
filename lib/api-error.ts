import "server-only";

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
// 보여줘도 되는 것: AI 호출 오류 안내, "KOSIS"로 시작하는 우리가 만든 한국어 오류. 그 밖은 일반 문구로 바꾼다.
export function toErrorResponse(e: unknown, tag: string): Response {
  if (e instanceof AiCallError) {
    return Response.json(errorBody(e.message, e.retryable), { status: 502 });
  }
  if (e instanceof Error && e.message.startsWith("KOSIS")) {
    return Response.json(errorBody(e.message, true), { status: 502 });
  }
  console.error(`[${tag}]`, e instanceof Error ? `${e.name}: ${e.message}` : "알 수 없는 오류");
  return Response.json(
    errorBody("일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.", true),
    { status: 500 },
  );
}
