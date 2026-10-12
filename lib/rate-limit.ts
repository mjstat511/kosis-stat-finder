import "server-only";

// 아주 단순한 호출 횟수 제한: 같은 사용자(IP)가 짧은 시간에 너무 많이 부르면 막는다. (비용 보호)
// 한계: 기록을 서버 메모리에 두기 때문에 Vercel처럼 서버가 여러 개로 나뉘면 서버마다 따로 센다.
// 그래서 완전한 방어는 아니고 "실수나 단순 반복"을 막는 정도이며, 진짜 비용 상한은 OpenAI 계정의 월 사용 한도로 건다.

type Rule = { name: string; windowMs: number; max: number };

const hits = new Map<string, number[]>();
const MAX_TRACKED_KEYS = 5_000; // 메모리가 무한정 커지지 않게 하는 상한

export type LimitResult = { ok: true } | { ok: false; retryAfterSec: number };

// 요청을 보낸 사람의 IP. Vercel은 x-forwarded-for(맨 앞이 실제 사용자)를 붙여 준다.
export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

export function checkRateLimit(key: string, rules: Rule[]): LimitResult {
  const now = Date.now();
  let worst = 0;

  for (const rule of rules) {
    const id = `${rule.name}:${key}`;
    const recent = (hits.get(id) ?? []).filter((t) => now - t < rule.windowMs);
    if (recent.length >= rule.max) {
      worst = Math.max(worst, Math.ceil((recent[0] + rule.windowMs - now) / 1000));
    }
    hits.set(id, recent);
  }
  if (worst > 0) return { ok: false, retryAfterSec: Math.max(worst, 1) };

  for (const rule of rules) hits.get(`${rule.name}:${key}`)!.push(now);

  if (hits.size > MAX_TRACKED_KEYS) {
    for (const [id, times] of hits) {
      if (times.length === 0 || now - times[times.length - 1] > 3_600_000) hits.delete(id);
    }
  }
  return { ok: true };
}

export function limitResponse(retryAfterSec: number): Response {
  return Response.json(
    {
      status: "error",
      message: `요청이 너무 많아요. ${retryAfterSec}초 뒤에 다시 시도해 주세요.`,
      retryable: true,
      kosisUrl: "https://kosis.kr",
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}
