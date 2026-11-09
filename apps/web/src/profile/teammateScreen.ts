// Which screen `#/teammates/<id>` shows. A person's profile and an AI
// teammate's have different shapes and screens, and only the AI's needs the
// live board. The kind comes from the board when it has loaded and lists the
// teammate; otherwise from the profile route itself, so a person's profile
// never waits for the board.
import { useEffect, useState } from "react";
import type { BoardResponse } from "@workbench/shared";
import { fetchProfileKind } from "../api/client.ts";

export type BoardPhase = "loading" | "error" | "ready";

/** What is known of the teammate: their kind, "unknown" when the API could not say, or undefined while asking. */
export type KnownKind = "human" | "ai" | "unknown" | undefined;

/**
 * - `human`: the person's profile. Also used when the kind is unknown, so the
 *   person's screen reports the API's error (such as 404) as it always has.
 * - `ai`: the AI teammate's profile, which needs the board.
 * - `wait`: still finding out the kind, or an AI teammate while the board loads.
 * - `board-error`: an AI teammate whose board could not be loaded.
 */
export type TeammateScreen = "human" | "ai" | "wait" | "board-error";

export function teammateScreen(board: BoardPhase, kind: KnownKind): TeammateScreen {
  if (kind === undefined) return "wait";
  if (kind !== "ai") return "human";
  if (board === "ready") return "ai";
  return board === "loading" ? "wait" : "board-error";
}

/** The teammate's kind on a loaded board, or undefined when the board has not loaded or does not list them. */
export function kindOnBoard(board: BoardResponse | undefined, teammateId: string): "human" | "ai" | undefined {
  return board?.teammates.find((t) => t.id === teammateId)?.kind;
}

/** The kind from the board when it knows, else asked of the profile route once. */
export function useTeammateKind(teammateId: string, fromBoard: "human" | "ai" | undefined): KnownKind {
  const [asked, setAsked] = useState<{ id: string; kind: "human" | "ai" | "unknown" } | undefined>();
  const needed = fromBoard === undefined;
  useEffect(() => {
    if (!needed) return;
    const abort = new AbortController();
    fetchProfileKind(teammateId, abort.signal).then(
      (kind) => setAsked({ id: teammateId, kind }),
      () => {
        if (!abort.signal.aborted) setAsked({ id: teammateId, kind: "unknown" });
      },
    );
    return () => abort.abort();
  }, [teammateId, needed]);
  if (fromBoard !== undefined) return fromBoard;
  return asked?.id === teammateId ? asked.kind : undefined;
}
