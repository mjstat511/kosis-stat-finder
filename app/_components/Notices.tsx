import type { Clarify } from "./types";

const boxClass =
  "flex flex-col gap-3 rounded-lg border p-4 border-zinc-200 dark:border-zinc-800";

// ③ 진행 상태: 지금 어느 단계인지 한 줄
export function LoadingNotice({ message }: { message: string }) {
  return (
    <p role="status" className="text-zinc-600 dark:text-zinc-400">
      {message}
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
      className={`${boxClass} border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40`}
    >
      <p className="font-medium text-red-800 dark:text-red-300">{message}</p>
      <div className="flex gap-2">
        {retryable && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
          >
            다시 시도
          </button>
        )}
        <a
          href={kosisUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-white dark:border-zinc-700 dark:hover:bg-zinc-900"
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
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
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
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            이런 키워드로 다시 찾아볼까요?
          </p>
          <div className="flex flex-wrap gap-2">
            {keywords.map((keyword) => (
              <button
                key={keyword}
                type="button"
                onClick={() => onPick(keyword)}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
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
