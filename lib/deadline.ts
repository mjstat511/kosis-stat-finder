import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

// 요청 하나가 쓸 수 있는 전체 시간(마감)을 정해 두고, 그 안에서 부르는 KOSIS·OpenAI 호출이
// 남은 시간을 넘지 않게 한다. 호출마다 제한 시간이 있어도 여러 번 이어 부르면 합계가
// 플랫폼의 최대 실행 시간(maxDuration)을 넘을 수 있어서, 그 전에 우리가 먼저 "지연" 오류로 끝낸다.
const store = new AsyncLocalStorage<{ endsAt: number }>();

// 남은 시간이 이보다 적으면 새 호출을 시작하지 않는다. (호출을 해도 끝나기 전에 마감이 되므로)
const MIN_USEFUL_MS = 1_500;
// 응답을 돌려주는 데 필요한 여유
const RESPONSE_MARGIN_MS = 500;

export class DeadlineError extends Error {
  constructor() {
    super("응답이 너무 늦어요. 잠시 후 다시 시도해 주세요.");
    this.name = "DeadlineError";
  }
}

export function runWithDeadline<T>(totalMs: number, fn: () => Promise<T>): Promise<T> {
  return store.run({ endsAt: Date.now() + totalMs }, fn);
}

// 지금 시작하는 외부 호출에 줄 제한 시간. 마감이 없으면(스크립트 등) 기본값을 그대로 쓴다.
export function callTimeout(defaultMs: number): number {
  const state = store.getStore();
  if (!state) return defaultMs;
  const remaining = state.endsAt - Date.now() - RESPONSE_MARGIN_MS;
  if (remaining < MIN_USEFUL_MS) throw new DeadlineError();
  return Math.min(defaultMs, remaining);
}
