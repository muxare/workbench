import type { BoardResponse, Teammate } from "@workbench/shared";
import { Avatar } from "./Avatar.tsx";
import { teammateNotes } from "./cardView.ts";
import { modeCountLabel } from "./modes.ts";
import { modeCounts } from "./teammates.ts";

export function TeammatePanel({ board, teammate }: { board: BoardResponse; teammate: Teammate }) {
  const ai = teammate.kind === "ai";
  return (
    <article className={`teammate${ai ? " teammate--ai" : ""}`} aria-label={teammate.name}>
      <Avatar board={board} id={teammate.id} size={ai ? "lg" : "md"} />
      <div className="teammate__body">
        <b className="teammate__name">{teammate.name}</b>
        {ai ? (
          <span className="teammate__sub">Works in the mode each person set for the step.</span>
        ) : (
          <span className="teammate__modes mono">
            {modeCounts(teammate).map((m, i) => (
              <span key={m.mode}>
                {i > 0 && " · "}
                <span className={`mode-text--${m.mode}`}>
                  {m.count} {modeCountLabel[m.mode]}
                </span>
              </span>
            ))}
          </span>
        )}
        {teammateNotes(teammate.id, board).map((n) => (
          <span key={n.text} className={`teammate__note tone--${n.tone}`}>
            {n.text}
          </span>
        ))}
      </div>
    </article>
  );
}
