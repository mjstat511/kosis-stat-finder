"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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

// 다른 페이지에 갔다가 뒤로가기로 돌아와도 화면이 그대로 남도록, 이 브라우저 탭에만 잠시 저장해 둔다.
// 서버로 보내지 않으며 탭을 닫으면 사라진다. (sessionStorage)
const VIEW_STORAGE_KEY = "first-trial:view:v1";
const RESTORABLE_KINDS = ["idle", "clarify", "notFound", "refused", "error", "candidates"];

type SavedView = {
  state: ScreenState;
  text: string;
  previousQuestion: string | null;
  lastQuestion: string | null;
  context: PreviousContext | null;
  sentPrevious: PreviousContext | null;
  sentClarification: string | null;
};

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
    return (await res.json()) as T;
  } catch (e) {
    if (signal.aborted) return null; // 새 질문 때문에 취소됨
    if (e instanceof Error && e.name === "TimeoutError") {
      return clientError("응답이 너무 늦어요. 잠시 후 다시 시도해 주세요.");
    }
    return clientError("서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
  }
}

// 화면 전체: 질문 → 후보 → 답변 흐름을 하나로 묶고, 서버 API와 연결한다.
// persist: 저장해 둔 화면을 확인한 뒤에만 true. 확인 전에 저장해 버리면 저장해 둔 화면을 덮어쓰기 때문이다.
function ChatView({ saved, persist }: { saved: SavedView | null; persist: boolean }) {
  const [state, setState] = useState<ScreenState>(saved?.state ?? { kind: "idle" });
  const [previousQuestion, setPreviousQuestion] = useState<string | null>(
    saved?.previousQuestion ?? null,
  );
  const [text, setText] = useState(saved?.text ?? ""); // 질문 입력창에 적힌 글자
  const lastQuestion = useRef<string | null>(saved?.lastQuestion ?? null);
  // 후속 질문을 위해 기억하는 "직전 질문" 한 개: 가장 최근에 성공한 질문과, 그 질문을 맥락까지 합친 문장.
  // 화면에만 있고 저장하지 않으며, 새로고침하면 사라진다. 성공하지 못한 질문 뒤에는 비운다.
  const contextRef = useRef<PreviousContext | null>(saved?.context ?? null);
  // 가장 최근 검색에서 서버에 보낸 직전 질문 (다시 시도할 때 같은 조건으로 보내려고 둔다)
  const sentPrevious = useRef<PreviousContext | null>(saved?.sentPrevious ?? null);
  // 가장 최근 검색에서 되묻기에 대한 사용자의 선택 (다시 시도할 때도 같이 보낸다)
  const sentClarification = useRef<string | null>(saved?.sentClarification ?? null);
  const controller = useRef<AbortController | null>(null);

  // 새 요청을 시작하면 앞선 요청은 취소한다.
  function startRequest(): AbortSignal {
    controller.current?.abort();
    controller.current = new AbortController();
    return controller.current.signal;
  }
  useEffect(() => () => controller.current?.abort(), []);

  // 화면이 바뀔 때마다 저장한다. 요청이 오가는 중에는 저장하지 않는다. (끝난 화면만 저장)
  useEffect(() => {
    if (!persist) return;
    const inFlight =
      state.kind === "searching" ||
      (state.kind === "candidates" && state.answer.kind === "loading");
    if (inFlight) return;
    const view: SavedView = {
      state,
      text,
      previousQuestion,
      lastQuestion: lastQuestion.current,
      context: contextRef.current,
      sentPrevious: sentPrevious.current,
      sentClarification: sentClarification.current,
    };
    try {
      sessionStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
    } catch {
      // 저장하지 못해도 화면은 정상 동작한다.
    }
  }, [persist, state, text, previousQuestion]);

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
        text={text}
        onTextChange={setText}
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

// 저장해 둔 화면을 처음 한 번만 읽는다.
let initialRaw: string | null | undefined;
function readSavedOnce(): string | null {
  if (initialRaw === undefined) {
    try {
      initialRaw = sessionStorage.getItem(VIEW_STORAGE_KEY);
    } catch {
      initialRaw = null; // 저장소를 못 읽으면(비공개 창 등) 처음 화면을 쓴다.
    }
  }
  return initialRaw;
}
const noSubscribe = () => () => {};

function parseSaved(raw: string | null): SavedView | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as SavedView;
    return RESTORABLE_KINDS.includes(saved?.state?.kind) ? saved : null;
  } catch {
    return null;
  }
}

// 서버가 그린 화면과 브라우저가 처음 그리는 화면은 같아야 하므로, 처음에는 저장분 없이 그리고
// 브라우저에서 준비가 끝난 뒤(hydrated)에 저장분을 읽어 그 화면으로 다시 시작한다.
const isBrowser = () => true;
const isServer = () => false;

export default function ChatScreen() {
  const hydrated = useSyncExternalStore(noSubscribe, isBrowser, isServer);
  const saved = hydrated ? parseSaved(readSavedOnce()) : null;
  // key가 바뀌면 처음부터 새로 그린다.
  return <ChatView key={saved ? "restored" : "fresh"} saved={saved} persist={hydrated} />;
}
