"use client";

import { useState } from "react";

export const MAX_LENGTH = 200;

type Props = {
  disabled: boolean;
  previousQuestion: string | null;
  onSubmit: (question: string) => void;
};

// ② 질문 입력: 입력창, 검색 버튼, 개인정보 안내, 글자 수
export default function QuestionForm({
  disabled,
  previousQuestion,
  onSubmit,
}: Props) {
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const canSubmit = !disabled && trimmed.length > 0;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(trimmed);
      }}
    >
      {previousQuestion && (
        <p className="text-sm text-[var(--space-faint)]">
          직전 질문: {previousQuestion}
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          className="space-input h-14 w-full px-5 text-base sm:w-auto sm:flex-1"
          type="text"
          value={text}
          maxLength={MAX_LENGTH}
          placeholder="예) 청년 실업률 추이"
          aria-label="질문 입력"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={!canSubmit} className="btn-primary h-14 px-8">
          검색
        </button>
      </div>
      <div className="flex items-start justify-between gap-4 text-sm text-[var(--space-faint)]">
        <p>이름·연락처 같은 개인정보는 입력하지 마세요. (질문은 AI로 전송됩니다)</p>
        <p className="shrink-0">
          {text.length} / {MAX_LENGTH}자
        </p>
      </div>
    </form>
  );
}
