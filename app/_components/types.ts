// 화면에서 쓰는 데이터 모양 (DESIGN.md 2번의 응답 형식에 맞춘 임시 정의)
// 서버 연결 때 lib/schemas.ts의 검사 모양으로 옮길 예정이다.

export type Candidate = {
  tblId: string;
  tblName: string; // 통계표 이름
  reason: string; // 선택 이유 한 문장
  period: string; // 수록 기간
};

export type Answer = {
  sentences: string[]; // 답변 문장 (5문장 이내)
  calculation?: string; // 계산식 (값마다 시점 표시)
  sourceName: string; // 출처 통계표 이름
  period: string; // 기준 시점 (단일 시점 또는 시작~끝 범위)
  kosisUrl: string; // KOSIS 원본 링크
};

export type Clarify = {
  message: string;
  options: string[];
};

// 화면이 보여줄 수 있는 상태 (DESIGN.md 1번 표)
export type ScreenState =
  | { kind: "idle" }
  | { kind: "loading"; message: string }
  | { kind: "candidates"; candidates: Candidate[]; selected: string }
  | { kind: "clarify"; clarify: Clarify }
  | { kind: "notFound"; keywords: string[] }
  | { kind: "refused" }
  | { kind: "answer"; candidates: Candidate[]; selected: string; answer: Answer }
  | { kind: "error"; message: string; kosisUrl: string };
