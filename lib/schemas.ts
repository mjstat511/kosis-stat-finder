import { z } from "zod";

import { QUESTION_MAX_LENGTH } from "@/lib/question-analysis";

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
  | { status: "candidates"; candidates: CandidateTable[]; contextualQuestion: string }
  | { status: "notFound"; message: string; altKeywords: string[] }
  | { status: "refused"; message: string }
  | { status: "error"; message: string; retryable: boolean; kosisUrl: string };
