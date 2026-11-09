import type { BoardConnection } from "../api/useBoard.ts";

const text: Record<BoardConnection, string> = {
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
};

export function ConnectionIndicator({ connection }: { connection: BoardConnection }) {
  return (
    <span className={`connection connection--${connection}`} role="status" aria-live="polite">
      <span className="connection__dot" aria-hidden="true" />
      {text[connection]}
    </span>
  );
}
