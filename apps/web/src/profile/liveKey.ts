// What the live board knows about one person's modes, so an open profile can
// follow the event stream without a stream of its own, as card detail does.
import type { BoardResponse } from "@workbench/shared";

/**
 * The id of the latest `mode_changed` event about `teammateId` in the board's
 * log, "" when the log holds none, and undefined while there is no board.
 * Board log entries carry no seq, so the id stands for the position.
 */
export function profileLiveKey(teammateId: string, board: BoardResponse | undefined): string | undefined {
  if (!board) return undefined;
  for (let i = board.log.length - 1; i >= 0; i -= 1) {
    const e = board.log[i]!;
    if (e.type === "mode_changed" && e.teammate_id === teammateId) return e.id;
  }
  return "";
}

/**
 * Follow the key as the board changes. `seen` is the last key that counted.
 * A new latest event means the profile is out of date. A key that goes to ""
 * only means the event scrolled out of the board's 50-event log, so it is
 * ignored and the old key kept. The first key seen is where following starts.
 */
export function followLiveKey(seen: string | undefined, next: string | undefined): { seen: string | undefined; reload: boolean } {
  if (next === undefined) return { seen, reload: false };
  if (seen === undefined) return { seen: next, reload: false };
  if (next === "" || next === seen) return { seen, reload: false };
  return { seen: next, reload: true };
}
