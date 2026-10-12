import type { Clarify } from "./types";

const boxClass =
  "space-card flex flex-col gap-3 p-5";

// ③ 진행 상태: 지금 어느 단계인지 한 줄
export function LoadingNotice({ message }: { message: string }) {
  return (
    <p role="status" className="animate-pulse text-center text-[var(--nebula-cyan)]">
      ✦ {message}
    </p>
  );
}

// ⑥ 오류 안내: 안내 문구, 다시 시도, KOSIS 바로가기
export function ErrorNotice({
  message,
  kosisUrl,
  retryable = true,
  onRetry,
}: {
  message: string;
  kosisUrl: string;
  retryable?: boolean;
  onRetry: () => void;
}) {
  return (
    <section
      role="alert"
      className={`${boxClass} !border-[rgba(255,120,150,0.5)] !bg-[rgba(70,10,30,0.5)]`}
    >
      <p className="font-medium text-[#ffb3c6]">{message}</p>
      <div className="flex gap-2">
        {retryable && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-[#d6336c] px-4 py-2 text-sm font-medium text-white hover:bg-[#e8467f]"
          >
            다시 시도
          </button>
        )}
        <a
          href={kosisUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost rounded-lg px-4 py-2 text-sm"
        >
          KOSIS 바로가기
        </a>
      </div>
    </section>
  );
}

// 되묻기: 후보가 갈려 좁히기 어려울 때 선택지를 보여준다 (한 번만)
export function ClarifyNotice({
  clarify,
  onPick,
}: {
  clarify: Clarify;
  onPick: (option: string) => void;
}) {
  return (
    <section className={boxClass}>
      <p className="font-medium">{clarify.message}</p>
      <div className="flex flex-wrap gap-2">
        {clarify.options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onPick(option)}
            className="btn-ghost rounded-full px-4 py-2 text-sm"
          >
            {option}
          </button>
        ))}
      </div>
    </section>
  );
}

// 후보 없음: "찾지 못했어요"와 대체 키워드 제안
export function NotFoundNotice({
  message,
  keywords,
  onPick,
}: {
  message: string;
  keywords: string[];
  onPick: (keyword: string) => void;
}) {
  return (
    <section className={boxClass}>
      <p className="font-medium">{message}</p>
      {keywords.length > 0 && (
        <>
          <p className="text-sm text-[var(--space-dim)]">
            이런 키워드로 다시 찾아볼까요?
          </p>
          <div className="flex flex-wrap gap-2">
            {keywords.map((keyword) => (
              <button
                key={keyword}
                type="button"
                onClick={() => onPick(keyword)}
                className="btn-ghost rounded-full px-4 py-2 text-sm"
              >
                {keyword}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// 예측·전망 요청 거절 안내
export function RefusedNotice({ message }: { message: string }) {
  return (
    <section className={boxClass}>
      <p className="font-medium">{message}</p>
    </section>
  );
}
