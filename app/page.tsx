import ChatScreen from "./_components/ChatScreen";

// 첫 화면: ① 제목 + 질문·후보·답변 화면
export default function Home() {
  return (
    <main className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-4 py-14 sm:py-20">
      <header className="flex flex-col items-center gap-3 text-center">
        <span aria-hidden="true" className="text-sm tracking-[0.6em] text-[var(--nebula-violet)]">
          ✦ ✧ ✦
        </span>
        <h1 className="title-glow text-5xl font-bold tracking-[0.12em] sm:text-6xl">통계찾기</h1>
        <p className="text-[var(--space-dim)]">별처럼 흩어진 KOSIS 통계에서 답을 찾아 드려요</p>
      </header>
      <ChatScreen />
    </main>
  );
}
