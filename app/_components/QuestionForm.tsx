"use client";

export const MAX_LENGTH = 200;

type Props = {
  text: string;
  onTextChange: (text: string) => void;
  disabled: boolean;
  previousQuestion: string | null;
  onSubmit: (question: string) => void;
};

// ② 질문 입력: 입력창, 검색 버튼, 개인정보 안내, 글자 수
export default function QuestionForm({
  text,
  onTextChange,
  disabled,
  previousQuestion,
  onSubmit,
}: Props) {
  const trimmed = text.trim();
  const canSubmit = !disabled && trimmed.length > 0;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(trimmed);
      }}
    >
      {previousQuestion && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          직전 질문: {previousQuestion}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="h-12 w-full rounded-lg sm:w-auto sm:flex-1 border border-zinc-300 bg-white px-4 text-base text-black outline-none focus:border-blue-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          type="text"
          value={text}
          maxLength={MAX_LENGTH}
          placeholder="예) 청년 실업률 추이"
          aria-label="질문 입력"
          onChange={(e) => onTextChange(e.target.value)}
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="h-12 rounded-lg bg-blue-600 px-6 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          검색
        </button>
      </div>
      <div className="flex items-start justify-between gap-4 text-sm text-zinc-500 dark:text-zinc-400">
        <p>이름·연락처 같은 개인정보는 입력하지 마세요. (질문은 AI로 전송됩니다)</p>
        <p className="shrink-0">
          {text.length} / {MAX_LENGTH}자
        </p>
      </div>
    </form>
  );
}
