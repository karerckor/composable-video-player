/** Drains pending microtasks (works with fake timers too). */
export async function flush(times = 10): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}
