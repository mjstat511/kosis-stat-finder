"use client";

import { useEffect, useRef, useState } from "react";
import type { AnswerResponse, SearchResponse } from "@/lib/schemas";
import AnswerCard from "./AnswerCard";
import CandidateList from "./CandidateList";
import { ClarifyNotice, ErrorNotice, LoadingNotice, NotFoundNotice, RefusedNotice } from "./Notices";
import QuestionForm from "./QuestionForm";
import type { AnswerState, ErrorInfo, ScreenState } from "./types";

const KOSIS_HOME = "https://kosis.kr";
// 서버가 오래 걸려도 화면이 무한정 기다리지 않게 하는 시간 (서버 최대 실행 시간보다 약간 길게)
const REQUEST_TIMEOUT_MS = 70_000;

// 서버로 보내는 직전 질문의 최대 길이 (서버의 질문 길이 제한과 같다)
const MAX_PREVIOUS_LENGTH = 200;

type ClientError = { status: "error" } & ErrorInfo;

// 직전 질문: 사용자가 입력한 문장과, 앞 맥락까지 합쳐 혼자서도 뜻이 통하게 만든 문장
type PreviousContext = { raw: string; merged: string };

function clientError(message: string, retryable = true): ClientError {
  return { status: "error", message, retryable, kosisUrl: KOSIS_HOME };
}

// 서버(API)에 JSON을 보내고 응답을 받는다. 취소되면 null, 연결·형식 문제는 오류 모양으로 돌려준다.
async function postJson<T>(
  url: string,
  body: unknown,
  signal: AbortSignal,
): Promise<T | ClientError | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    });
    // 서버가 도중에 끊기거나 플랫폼 오류 페이지가 오면 JSON이 아니다. 연결 문제와 구분해서 안내한다.
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return clientError("서버가 응답을 마치지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
    const status = (data as { status?: unknown } | null)?.status;
    if (typeof status !== "string") {
      return clientError("서버 응답을 이해하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
    return data as T;
  } catch (e) {
    if (signal.aborted) return null; // 새 질문 때문에 취소됨
    if (e instanceof Error && e.name === "TimeoutError") {
      return clientError("응답이 너무 늦어요. 잠시 후 다시 시도해 주세요.");
    }
    return clientError("서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
  }
}

// 화면 전체: 질문 → 후보 → 답변 흐름을 하나로 묶고, 서버 API와 연결한다.
export default function ChatScreen() {
  const [state, setState] = useState<ScreenState>({ kind: "idle" });
  const [previousQuestion, setPreviousQuestion] = useState<string | null>(null);
  const lastQuestion = useRef<string | null>(null);
  // 후속 질문을 위해 기억하는 "직전 질문" 한 개: 가장 최근에 성공한 질문과, 그 질문을 맥락까지 합친 문장.
  // 화면에만 있고 저장하지 않으며, 새로고침하면 사라진다. 성공하지 못한 질문 뒤에는 비운다.
  const contextRef = useRef<PreviousContext | null>(null);
  // 가장 최근 검색에서 서버에 보낸 직전 질문 (다시 시도할 때 같은 조건으로 보내려고 둔다)
  const sentPrevious = useRef<PreviousContext | null>(null);
  // 가장 최근 검색에서 되묻기에 대한 사용자의 선택 (다시 시도할 때도 같이 보낸다)
  const sentClarification = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  // 새 요청을 시작하면 앞선 요청은 취소한다.
  function startRequest(): AbortSignal {
    controller.current?.abort();
    controller.current = new AbortController();
    return controller.current.signal;
  }
  useEffect(() => () => controller.current?.abort(), []);

  // 선택한 통계표로 답변을 받아 온다. 후보 목록은 그대로 두고 답변 자리만 바꾼다.
  async function loadAnswer(
    tblId: string,
    current: Extract<ScreenState, { kind: "candidates" }>,
  ) {
    const signal = startRequest();
    const candidate = current.candidates.find((c) => c.tblId === tblId);
    if (!candidate) return;

    setState({ ...current, selected: tblId, answer: { kind: "loading" } });

    const res = await postJson<AnswerResponse>(
      "/api/answer",
      {
        question: current.question,
        orgId: candidate.orgId,
        tblId: candidate.tblId,
        hints: current.hints,
      },
      signal,
    );
    if (res === null) return;

    let answer: AnswerState;
    if (res.status === "answer") answer = { kind: "done", answer: res };
    else if (res.status === "notFound") answer = { kind: "notFound", message: res.message };
    else answer = { kind: "error", message: res.message, retryable: res.retryable, kosisUrl: res.kosisUrl };

    setState((prev) =>
      prev.kind === "candidates" && prev.selected === tblId ? { ...prev, answer } : prev,
    );
  }

  async function search(
    question: string,
    previousOverride?: PreviousContext | null,
    clarification: string | null = null,
  ) {
    const signal = startRequest();
    const previous = previousOverride !== undefined ? previousOverride : contextRef.current;
    sentPrevious.current = previous;
    sentClarification.current = clarification;
    setPreviousQuestion(previous ? previous.raw : null); // 맥락으로 쓰인 직전 질문만 화면에 보여준다
    lastQuestion.current = question;
    setState({ kind: "searching" });

    const res = await postJson<SearchResponse>(
      "/api/search",
      {
        question,
        previousQuestion: previous?.merged.slice(0, MAX_PREVIOUS_LENGTH) ?? null,
        clarification,
      },
      signal,
    );
    if (res === null) return;

    // 성공하면 이 질문을 다음 후속 질문의 맥락으로 기억하고, 아니면 비운다.
    contextRef.current =
      res.status === "candidates" ? { raw: question, merged: res.contextualQuestion } : null;

    switch (res.status) {
      case "candidates": {
        // 1순위를 자동으로 선택해 바로 답변을 받아 온다.
        const first: Extract<ScreenState, { kind: "candidates" }> = {
          kind: "candidates",
          candidates: res.candidates,
          selected: res.candidates[0].tblId,
          hints: res.hints,
          question: res.contextualQuestion,
          answer: { kind: "loading" },
        };
        void loadAnswer(first.selected, first);
        break;
      }
      case "clarify":
        setState({ kind: "clarify", message: res.message, options: res.options });
        break;
      case "notFound":
        setState({ kind: "notFound", message: res.message, altKeywords: res.altKeywords });
        break;
      case "refused":
        setState({ kind: "refused", message: res.message });
        break;
      default:
        setState({ kind: "error", message: res.message, retryable: res.retryable, kosisUrl: res.kosisUrl });
    }
  }

  function retrySearch() {
    if (lastQuestion.current) {
      void search(lastQuestion.current, sentPrevious.current, sentClarification.current);
    }
  }

  const searching = state.kind === "searching";

  return (
    <div className="flex flex-col gap-6">
      <QuestionForm
        disabled={searching}
        previousQuestion={previousQuestion}
        onSubmit={(q) => void search(q)}
      />

      {searching && <LoadingNotice message="통계표를 찾는 중…" />}

      {state.kind === "clarify" && (
        <ClarifyNotice
          clarify={state}
          onPick={(option) => {
            // 원래 질문에 선택한 말을 더해 한 번만 다시 찾는다.
            if (lastQuestion.current) {
              void search(lastQuestion.current, sentPrevious.current, option);
            }
          }}
        />
      )}

      {state.kind === "notFound" && (
        <NotFoundNotice
          message={state.message}
          keywords={state.altKeywords}
          onPick={(keyword) => void search(keyword)}
        />
      )}

      {state.kind === "refused" && <RefusedNotice message={state.message} />}

      {state.kind === "error" && (
        <ErrorNotice
          message={state.message}
          kosisUrl={state.kosisUrl}
          retryable={state.retryable}
          onRetry={retrySearch}
        />
      )}

      {state.kind === "candidates" && (
        <>
          <CandidateList
            candidates={state.candidates}
            selected={state.selected}
            onSelect={(tblId) => void loadAnswer(tblId, state)}
          />
          {state.answer.kind === "loading" && <LoadingNotice message="수치를 가져오는 중…" />}
          {state.answer.kind === "done" && <AnswerCard answer={state.answer.answer} />}
          {state.answer.kind === "notFound" && (
            <NotFoundNotice message={state.answer.message} keywords={[]} onPick={() => {}} />
          )}
          {state.answer.kind === "error" && (
            <ErrorNotice
              message={state.answer.message}
              kosisUrl={state.answer.kosisUrl}
              retryable={state.answer.retryable}
              onRetry={() => void loadAnswer(state.selected, state)}
            />
          )}
        </>
      )}
    </div>
  );
}
