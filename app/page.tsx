import ChatScreen from "./_components/ChatScreen";

// 첫 화면: ① 제목 + 질문·후보·답변 화면
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-12 sm:py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          first trial
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          KOSIS 통계를 찾아 답해드려요
        </p>
      </header>
      <ChatScreen />
    </main>
  );
}
