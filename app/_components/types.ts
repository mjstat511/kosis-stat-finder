// 화면에서 쓰는 상태 모양. 서버가 주고받는 모양은 lib/schemas.ts에서 가져온다. (타입만 가져오므로 서버 코드는 화면에 들어오지 않는다)
import type { AnswerHints, AnswerResponse, CandidateTable } from "@/lib/schemas";

export type ErrorInfo = { message: string; retryable: boolean; kosisUrl: string };

export type AnswerOk = Extract<AnswerResponse, { status: "answer" }>;

// 되묻기 선택지 (서버 쪽 되묻기를 만들 때 연결한다 · PLAN 7번)
export type Clarify = {
  message: string;
  options: string[];
};

// 선택한 후보의 답변이 지금 어떤 상태인지
export type AnswerState =
  | { kind: "loading" }
  | { kind: "done"; answer: AnswerOk }
  | { kind: "notFound"; message: string }
  | ({ kind: "error" } & ErrorInfo);

// 화면이 보여줄 수 있는 상태 (DESIGN.md 1번 표)
export type ScreenState =
  | { kind: "idle" }
  | { kind: "searching" }
  | {
      kind: "candidates";
      candidates: CandidateTable[];
      selected: string; // 선택된 통계표 ID
      hints: AnswerHints;
      question: string; // 맥락을 합친 질문
      answer: AnswerState;
    }
  | { kind: "notFound"; message: string; altKeywords: string[] }
  | { kind: "refused"; message: string }
  | ({ kind: "error" } & ErrorInfo);
