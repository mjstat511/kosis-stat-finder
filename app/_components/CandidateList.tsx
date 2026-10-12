import type { CandidateTable } from "@/lib/schemas";

type Props = {
  candidates: CandidateTable[];
  selected: string;
  onSelect: (tblId: string) => void;
};

// ④ 후보 통계표: 최대 3개, 1순위 자동 선택, 다른 후보로 바꾸기
export default function CandidateList({ candidates, selected, onSelect }: Props) {
  return (
    <section aria-label="후보 통계표" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-[var(--nebula-violet)]">✧ 후보 통계표</h2>
      <ul className="flex flex-col gap-3">
        {candidates.map((c, i) => {
          const isSelected = c.tblId === selected;
          return (
            <li
              key={c.tblId}
              className={`space-card flex flex-col gap-1.5 p-4 ${isSelected ? "space-card-selected" : ""}`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">
                  {c.tblName}
                  {i === 0 && (
                    <span className="ml-2 rounded-full bg-[rgba(139,123,255,0.25)] px-2 py-0.5 text-xs text-[var(--nebula-violet)]">
                      1순위
                    </span>
                  )}
                </p>
                {isSelected ? (
                  <span className="shrink-0 text-sm font-medium text-[var(--nebula-cyan)]">
                    ● 선택됨
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(c.tblId)}
                    className="btn-ghost shrink-0 rounded-lg px-3 py-1 text-sm"
                  >
                    이 표로 보기
                  </button>
                )}
              </div>
              <p className="text-sm text-[var(--space-dim)]">이유: {c.reason}</p>
              <p className="text-sm text-[var(--space-faint)]">수록 기간 {c.period}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
