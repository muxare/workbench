import { modeMeaning, modes } from "./modes.ts";

const lines = [
  { kind: "works", text: "works on a card" },
  { kind: "asks", text: "needs input" },
  { kind: "reports", text: "reports back" },
] as const;

function ModeItem({ index }: { index: number }) {
  const m = modes[index];
  if (!m) return null;
  return (
    <span className="legend__item">
      <span className={`legend__swatch legend__swatch--${m}`} />
      {modeMeaning[m]}
    </span>
  );
}

/**
 * "How to read it": the three line styles beside the three modes. With
 * `modesOnly`, only the modes, for a screen that draws no lines between teammates.
 */
export function Legend({ modesOnly = false }: { modesOnly?: boolean }) {
  return (
    <aside className={`legend${modesOnly ? " legend--modes" : ""}`} aria-label="How to read it">
      <div className="legend__head mono">How to read it</div>
      <div className="legend__grid">
        {modesOnly
          ? modes.map((m, i) => <ModeItem key={m} index={i} />)
          : lines.map((l, i) => (
              <div key={l.kind} className="legend__pair">
                <span className="legend__item">
                  <span className={`legend__line legend__line--${l.kind}`} />
                  {l.text}
                </span>
                <ModeItem index={i} />
              </div>
            ))}
      </div>
    </aside>
  );
}
