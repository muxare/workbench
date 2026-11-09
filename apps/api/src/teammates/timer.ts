// An optional timer that runs one AI teammate step at a fixed interval, so
// the teammate picks up a card soon after a person moves it to Ready, the way
// a colleague would, without anyone pressing a button. It is off unless
// TEAMMATE_INTERVAL_MS is set (see main.ts). Each tick goes through
// `runTeammate`, so the same rules and the same atomic write apply as for
// `POST /api/teammates/:id/run`, and its events reach SSE clients through the
// store.
import type { Db } from "../db/client.ts";
import type { TeammateProvider } from "./provider.ts";
import { runTeammate, type TeammateRun } from "./runner.ts";

export interface TimerOptions {
  teammateId: string;
  provider: TeammateProvider;
  intervalMs: number;
  /** Called after each run that worked a card. */
  onRun?: (run: TeammateRun) => void;
  /** Called when a tick fails; the timer keeps going. Defaults to console.error. */
  onError?: (err: unknown) => void;
}

/**
 * Read TEAMMATE_INTERVAL_MS. Unset or empty means no timer; anything else
 * must be a whole number of milliseconds, at least 1000, so a typo cannot
 * flood the board.
 */
export function timerInterval(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const ms = Number(raw);
  if (!Number.isInteger(ms) || ms < 1000) {
    throw new Error(`TEAMMATE_INTERVAL_MS must be a whole number of milliseconds, at least 1000, not '${raw}'`);
  }
  return ms;
}

/**
 * Start the timer. A tick is skipped while the previous one is still running,
 * so a slow provider never works two cards at once. Returns a function that
 * stops it.
 */
export function startTeammateTimer(db: Db, options: TimerOptions): () => void {
  const onError = options.onError ?? ((err: unknown) => console.error(`${options.teammateId} timer:`, err));
  let running = false;
  const handle = setInterval(() => {
    if (running) return;
    running = true;
    runTeammate(db, { teammateId: options.teammateId, provider: options.provider })
      .then((run) => {
        if (run) options.onRun?.(run);
      }, onError)
      .finally(() => {
        running = false;
      });
  }, options.intervalMs);
  return () => clearInterval(handle);
}
