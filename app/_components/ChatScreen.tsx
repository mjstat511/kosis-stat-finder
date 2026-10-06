"use client";

import { useEffect, useRef, useState } from "react";
import AnswerCard from "./AnswerCard";
import CandidateList from "./CandidateList";
import {
  ClarifyNotice,
  ErrorNotice,
  LoadingNotice,
  NotFoundNotice,
  RefusedNotice,
} from "./Notices";
import QuestionForm from "./QuestionForm";
import {
  KOSIS_HOME,
  mockAltKeywords,
  mockAnswer,
  mockCandidates,
  mockClarify,
} from "./mockData";
import type { ScreenState } from "./types";

const FAKE_DELAY_MS = 700;

// 화면 전체: 질문 → 후보 → 답변 흐름을 하나로 묶는다.
// 지금은 서버 없이 가짜 데이터로 모양만 보여준다.
// 질문에 특정 말을 넣으면 여러 상태를 눈으로 확인할 수 있다 (임시):
//   "오류" → 오류 안내, "예측"/"전망" → 거절, "없음" → 후보 없음, "물가" → 되묻기
export default function ChatScreen() {
  const [state, setState] = useState<ScreenState>({ kind: "idle" });
  const [previousQuestion, setPreviousQuestion] = useState<string | null>(null);
  const lastQuestion = useRef<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // 화면을 떠나거나 새 질문이 오면 남은 가짜 대기를 취소한다.
  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }
  useEffect(() => clearTimers, []);

  function later(fn: () => void) {
    timers.current.push(setTimeout(fn, FAKE_DELAY_MS));
  }

  function showAnswer(selected: string) {
    const candidates = mockCandidates;
    setState({ kind: "candidates", candidates, selected });
    later(() =>
      setState({ kind: "answer", candidates, selected, answer: mockAnswer }),
    );
  }

  // clarified: 이미 한 번 되물은 뒤의 검색이면 다시 되묻지 않는다 (되묻기는 질문당 한 번)
  function search(question: string, clarified = false) {
    clearTimers();
    setPreviousQuestion(lastQuestion.current);
    lastQuestion.current = question;
    setState({ kind: "loading", message: "통계표를 찾는 중…" });

    later(() => {
      if (question.includes("오류")) {
        setState({
          kind: "error",
          message: "KOSIS 응답이 늦어요. 잠시 후 다시 시도해 주세요.",
          kosisUrl: KOSIS_HOME,
        });
      } else if (/예측|전망/.test(question)) {
        setState({ kind: "refused" });
      } else if (question.includes("없음")) {
        setState({ kind: "notFound", keywords: mockAltKeywords });
      } else if (!clarified && question.includes("물가")) {
        setState({ kind: "clarify", clarify: mockClarify });
      } else {
        showAnswer(mockCandidates[0].tblId);
      }
    });
  }

  function selectCandidate(tblId: string) {
    clearTimers();
    showAnswer(tblId);
  }

  const busy = state.kind === "loading" || state.kind === "candidates";

  return (
    <div className="flex flex-col gap-6">
      <QuestionForm
        disabled={busy}
        previousQuestion={previousQuestion}
        onSubmit={search}
      />

      {state.kind === "loading" && <LoadingNotice message={state.message} />}

      {state.kind === "clarify" && (
        <ClarifyNotice
          clarify={state.clarify}
          onPick={(option) => search(`${lastQuestion.current} ${option}`, true)}
        />
      )}

      {state.kind === "notFound" && (
        <NotFoundNotice keywords={state.keywords} onPick={search} />
      )}

      {state.kind === "refused" && <RefusedNotice />}

      {state.kind === "error" && (
        <ErrorNotice
          message={state.message}
          kosisUrl={state.kosisUrl}
          onRetry={() => lastQuestion.current && search(lastQuestion.current)}
        />
      )}

      {(state.kind === "candidates" || state.kind === "answer") && (
        <>
          <CandidateList
            candidates={state.candidates}
            selected={state.selected}
            onSelect={selectCandidate}
          />
          {state.kind === "candidates" && (
            <LoadingNotice message="수치를 가져오는 중…" />
          )}
        </>
      )}

      {state.kind === "answer" && <AnswerCard answer={state.answer} />}
    </div>
  );
}
