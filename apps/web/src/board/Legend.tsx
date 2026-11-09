import { modeMeaning, modes } from "./modes.ts";

const lines = [
  { kind: "works", text: "works on a card" },
  { kind: "asks", text: "needs input" },
  { kind: "reports", text: "reports back" },
] as const;

/** "How to read it": the three line styles beside the three modes. */
export function Legend() {
  return (
    <aside className="legend" aria-label="How to read it">
      <div className="legend__head mono">How to read it</div>
      <div className="legend__grid">
        {lines.map((l, i) => (
          <div key={l.kind} className="legend__pair">
            <span className="legend__item">
              <span className={`legend__line legend__line--${l.kind}`} />
              {l.text}
            </span>
            {modes[i] && (
              <span className="legend__item">
                <span className={`legend__swatch legend__swatch--${modes[i]}`} />
                {modeMeaning[modes[i]]}
              </span>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
