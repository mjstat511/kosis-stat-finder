import type { Answer } from "./types";

// ⑤ 답변: 문장, 계산식, 출처, 기준 시점, KOSIS 원본 링크
export default function AnswerCard({ answer }: { answer: Answer }) {
  return (
    <section
      aria-label="답변"
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <h2 className="text-lg font-semibold">답변</h2>
      <p className="leading-7">{answer.sentences.join(" ")}</p>
      {answer.calculation && (
        <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-900">
          계산식: {answer.calculation}
        </p>
      )}
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        출처: {answer.sourceName} · 기준 시점 {answer.period}
      </p>
      <a
        href={answer.kosisUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-fit text-sm font-medium text-blue-700 underline dark:text-blue-400"
      >
        KOSIS에서 원본 보기
      </a>
    </section>
  );
}
