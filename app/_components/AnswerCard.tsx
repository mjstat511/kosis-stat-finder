import type { AnswerOk } from "./types";

// ⑤ 답변: 문장, 계산식, 출처, 기준 시점, KOSIS 원본 링크
export default function AnswerCard({ answer }: { answer: AnswerOk }) {
  return (
    <section aria-label="답변" className="space-card flex flex-col gap-4 p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-[var(--nebula-cyan)]">✦ 답변</h2>
      <p className="leading-8 text-[var(--space-ink)]">{answer.sentences.join(" ")}</p>
      {answer.calculations.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl border border-[var(--card-border)] bg-[rgba(10,6,30,0.6)] px-4 py-3 text-sm text-[var(--space-dim)]">
          {answer.calculations.map((calc) => (
            <li key={calc}>계산식: {calc}</li>
          ))}
        </ul>
      )}
      {answer.truncated && (
        <p className="text-sm text-[var(--space-faint)]">
          기간이 넓어 최근 일부 시점만 보여드려요.
        </p>
      )}
      <p className="text-sm text-[var(--space-dim)]">
        출처: {answer.source.tableName} · 기준 시점 {answer.period}
      </p>
      <a
        href={answer.source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="space-link w-fit text-sm font-medium"
      >
        KOSIS에서 원본 보기
      </a>
    </section>
  );
}
