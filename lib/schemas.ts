import { z } from "zod";

import { QUESTION_MAX_LENGTH } from "@/lib/question-analysis";

// 후보 찾기에서 뽑아 둔 질문 정보. 후보 응답에 담겨 나갔다가 답변 요청에 그대로 돌아온다.
// (답변 단계에서 질문을 다시 분석하지 않아 AI 호출과 시간을 아낀다. 값이 바뀌어도 코드 고르기에만 영향을 준다.)
export const AnswerHintsSchema = z.object({
  keywords: z.array(z.string().max(40)).max(5),
  regions: z.array(z.string().max(40)).max(5),
  filterWords: z.array(z.string().max(40)).max(8),
  periodType: z.enum(["Y", "H", "Q", "M"]).nullable(),
  recentCount: z.number().int().min(1).max(12).nullable(),
  fromYear: z.number().int().min(1900).max(2200).nullable(),
  toYear: z.number().int().min(1900).max(2200).nullable(),
});

export type AnswerHints = z.infer<typeof AnswerHintsSchema>;

// 답변 요청 (DESIGN.md 흐름 B 입력)
export const AnswerRequestSchema = z.object({
  question: z.string().max(QUESTION_MAX_LENGTH * 2), // 맥락을 합친 질문
  orgId: z.string().regex(/^[A-Za-z0-9_]{1,20}$/),
  tblId: z.string().regex(/^[A-Za-z0-9_]{1,40}$/),
  hints: AnswerHintsSchema,
});

export type AnswerRequest = z.infer<typeof AnswerRequestSchema>;

// 후보 찾기 요청 (DESIGN.md 흐름 A 입력)
export const SearchRequestSchema = z.object({
  question: z.string().max(QUESTION_MAX_LENGTH * 2), // 길이 규칙은 분석 단계에서 한국어 안내로 거절한다
  previousQuestion: z.string().max(QUESTION_MAX_LENGTH * 2).nullish(),
  clarification: z.string().max(QUESTION_MAX_LENGTH).nullish(),
});

export type SearchRequest = z.infer<typeof SearchRequestSchema>;

// 후보 한 개 (화면의 ④ 후보 카드에 쓰인다)
export type CandidateTable = {
  orgId: string;
  tblId: string;
  tblName: string;
  reason: string; // 선택 이유 한 문장
  period: string; // 수록 기간 (예: "1999~2026")
};

// 후보 찾기 응답 (DESIGN.md 2번 "응답 형식")
export type SearchResponse =
  | {
      status: "candidates";
      candidates: CandidateTable[];
      contextualQuestion: string;
      hints: AnswerHints;
    }
  | { status: "notFound"; message: string; altKeywords: string[] }
  | { status: "refused"; message: string }
  | { status: "error"; message: string; retryable: boolean; kosisUrl: string };

// 답변에 쓴 수치 한 줄 (화면의 계산식·출처 표시에 쓰인다)
export type AnswerDataRow = {
  periodLabel: string;
  classNames: string[];
  value: number;
  unit: string;
};

// 답변 응답. 출처 통계표 이름과 기준 시점은 PLAN 9번에서 서버가 붙인다.
export type AnswerResponse =
  | {
      status: "answer";
      sentences: string[];
      calculations: string[]; // 서버가 다시 계산해 만든 계산식
      data: AnswerDataRow[]; // 답변의 근거가 된 조회 수치
      truncated: boolean; // 범위가 넓어 최근 일부만 썼으면 true
    }
  | { status: "notFound"; message: string; altKeywords: string[] }
  | { status: "error"; message: string; retryable: boolean; kosisUrl: string };
