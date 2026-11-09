// What the live board knows about one person's modes, so an open profile can
// follow the event stream without a stream of its own, as card detail does.
import type { BoardResponse } from "@workbench/shared";

/**
 * The ids of the `mode_changed` events about `teammateId` in the board's log.
 * When it changes, someone changed this person's modes (in this browser or
 * another) and the profile is out of date. Undefined while there is no board.
 */
export function profileLiveKey(teammateId: string, board: BoardResponse | undefined): string | undefined {
  if (!board) return undefined;
  const ids = board.log.filter((e) => e.type === "mode_changed" && e.teammate_id === teammateId).map((e) => e.id);
  return ids.join(" ");
}
