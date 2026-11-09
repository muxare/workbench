import type { BoardResponse } from "@workbench/shared";
import { findTeammate, labelOf } from "./teammates.ts";

/** A round avatar with a teammate's short label; the AI teammate is filled dark. */
export function Avatar({ board, id, size = "sm" }: { board: BoardResponse; id: string; size?: "sm" | "md" | "lg" }) {
  const teammate = findTeammate(board, id);
  return (
    <span className={`avatar avatar--${size}${teammate?.kind === "ai" ? " avatar--ai" : ""}`} title={teammate?.name ?? id}>
      {labelOf(board, id)}
    </span>
  );
}
