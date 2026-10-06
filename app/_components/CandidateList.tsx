import type { Candidate } from "./types";

type Props = {
  candidates: Candidate[];
  selected: string;
  onSelect: (tblId: string) => void;
};

// ④ 후보 통계표: 최대 3개, 1순위 자동 선택, 다른 후보로 바꾸기
export default function CandidateList({ candidates, selected, onSelect }: Props) {
  return (
    <section aria-label="후보 통계표" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">후보 통계표</h2>
      <ul className="flex flex-col gap-2">
        {candidates.map((c, i) => {
          const isSelected = c.tblId === selected;
          return (
            <li
              key={c.tblId}
              className={`flex flex-col gap-1 rounded-lg border p-4 ${
                isSelected
                  ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">
                  {c.tblName}
                  {i === 0 && (
                    <span className="ml-2 text-xs text-zinc-500">1순위</span>
                  )}
                </p>
                {isSelected ? (
                  <span className="shrink-0 text-sm font-medium text-blue-700 dark:text-blue-400">
                    선택됨
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(c.tblId)}
                    className="shrink-0 rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    이 표로 보기
                  </button>
                )}
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                이유: {c.reason}
              </p>
              <p className="text-sm text-zinc-500">수록 기간 {c.period}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
