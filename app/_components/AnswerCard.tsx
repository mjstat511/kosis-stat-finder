import type { AnswerOk } from "./types";

// ⑤ 답변: 문장, 계산식, 출처, 기준 시점, KOSIS 원본 링크
export default function AnswerCard({ answer }: { answer: AnswerOk }) {
  return (
    <section
      aria-label="답변"
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <h2 className="text-lg font-semibold">답변</h2>
      <p className="leading-7">{answer.sentences.join(" ")}</p>
      {answer.calculations.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-900">
          {answer.calculations.map((calc) => (
            <li key={calc}>계산식: {calc}</li>
          ))}
        </ul>
      )}
      {answer.truncated && (
        <p className="text-sm text-zinc-500">
          기간이 넓어 최근 일부 시점만 보여드려요.
        </p>
      )}
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        출처: {answer.source.tableName} · 기준 시점 {answer.period}
      </p>
      <a
        href={answer.source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="w-fit text-sm font-medium text-blue-700 underline dark:text-blue-400"
      >
        KOSIS에서 원본 보기
      </a>
    </section>
  );
}
