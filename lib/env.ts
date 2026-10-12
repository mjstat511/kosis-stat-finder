import "server-only";

// 서버에서만 읽을 수 있는 비밀 키 이름 목록 (값은 .env에 있다)
type ServerEnvName = "KOSIS_API_KEY" | "OPENAI_API_KEY";

// 설정(키)이 빠졌을 때의 오류. 사용자에게는 "관리자에게 알려 주세요"만 보여주고(다시 시도 불가),
// 어떤 키가 빠졌는지는 서버 로그에만 남긴다. (키 이름을 공개 화면에 내보내지 않는다)
export class ConfigError extends Error {
  constructor() {
    super("서비스 설정에 문제가 있어요. 관리자에게 알려 주세요.");
    this.name = "ConfigError";
  }
}

// .env(또는 Vercel 환경 변수)의 비밀 키를 읽는다. 없거나 비어 있으면 ConfigError를 낸다.
// "server-only" 때문에 브라우저(클라이언트 컴포넌트)에서 가져다 쓰면 빌드 단계에서 막힌다.
export function getServerEnv(name: ServerEnvName): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`[env] ${name} 값이 없습니다. .env 또는 Vercel 환경 변수를 확인해 주세요.`);
    throw new ConfigError();
  }
  return value;
}
