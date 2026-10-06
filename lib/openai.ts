import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

import { getServerEnv } from "@/lib/env";

// 사용할 모델: 질문 분석·후보 선별·답변 작성은 짧은 구조화 작업이라 작고 빠른 모델이면 충분하다.
// 품질이 모자라면 이 한 줄만 바꾼다.
export const OPENAI_MODEL = "gpt-5.4-mini";

// 호출 하나의 제한 시간 (DESIGN.md 2번 "시간 제한": OpenAI 15초)
const TIMEOUT_MS = 15_000;

// 출력 길이 상한 (비용 보호). 호출할 때 더 작게 줄 수 있다.
const DEFAULT_MAX_OUTPUT_TOKENS = 1_000;

export type AiErrorKind = "timeout" | "auth" | "quota" | "format" | "unknown";

// 화면에 그대로 보여줘도 되는 한국어 안내만 담은 오류 (키나 내부 내용은 넣지 않는다)
export class AiCallError extends Error {
  constructor(
    public kind: AiErrorKind,
    message: string,
    public retryable: boolean,
  ) {
    super(message);
    this.name = "AiCallError";
  }
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
  client ??= new OpenAI({
    apiKey: getServerEnv("OPENAI_API_KEY"),
    timeout: TIMEOUT_MS,
    maxRetries: 0, // 다시 시도는 우리가 정한 곳에서만 한다
  });
  return client;
}

function toAiCallError(e: unknown): AiCallError {
  if (e instanceof AiCallError) return e;
  if (e instanceof OpenAI.APIConnectionTimeoutError) {
    return new AiCallError("timeout", "AI 응답이 늦어요. 잠시 후 다시 시도해 주세요.", true);
  }
  if (e instanceof OpenAI.APIError) {
    if (e.status === 401 || e.status === 403) {
      return new AiCallError("auth", "AI 연결 설정에 문제가 있어요. 관리자에게 알려 주세요.", false);
    }
    if (e.status === 429) {
      return new AiCallError("quota", "AI 이용량이 많거나 한도를 넘었어요. 잠시 후 다시 시도해 주세요.", true);
    }
  }
  return new AiCallError("unknown", "AI와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", true);
}

type AskOptions<S extends z.ZodType> = {
  system: string; // AI가 지킬 규칙
  user: string; // 이번 입력
  schema: S; // AI 답변이 따라야 할 모양 (zod)
  name: string; // 모양의 이름 (영문, 예: "question_analysis")
  maxOutputTokens?: number;
};

// OpenAI에 질문하고, 답을 정해진 모양(zod)으로 받는다.
// 모양에 맞지 않거나 잘리면 AiCallError("format")를 낸다.
// 요청 내용이 OpenAI 쪽에 보관되지 않도록 store: false로 보낸다.
export async function askJson<S extends z.ZodType>(
  options: AskOptions<S>,
): Promise<z.infer<S>> {
  try {
    const res = await getClient().responses.parse({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
      text: { format: zodTextFormat(options.schema, options.name) },
      max_output_tokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      reasoning: { effort: "low" },
      store: false,
    });

    if (res.output_parsed == null) {
      throw new AiCallError("format", "AI 답변 형식이 올바르지 않아요. 다시 시도해 주세요.", true);
    }
    return res.output_parsed as z.infer<S>;
  } catch (e) {
    throw toAiCallError(e);
  }
}
