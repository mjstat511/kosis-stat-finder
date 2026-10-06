import "server-only";

// 서버에서만 읽을 수 있는 비밀 키 이름 목록 (값은 .env에 있다)
type ServerEnvName = "KOSIS_API_KEY" | "OPENAI_API_KEY";

// .env의 비밀 키를 읽는다. 없거나 비어 있으면 어떤 키가 문제인지 알려주는 오류를 낸다.
// "server-only" 때문에 브라우저(클라이언트 컴포넌트)에서 가져다 쓰면 빌드 단계에서 막힌다.
export function getServerEnv(name: ServerEnvName): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`.env에 ${name} 값이 없습니다. 값을 넣고 개발 서버를 다시 시작해 주세요.`);
  }
  return value;
}
