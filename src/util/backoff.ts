export function computeBackoffDelay(
  attempt: number,
  baseMs: number,
  maxMs: number,
): number {
  const delay = Math.min(maxMs, baseMs * 2 ** Math.max(attempt, 0));
  const jitter = Math.floor(delay * 0.2 * Math.random());
  return delay + jitter;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
