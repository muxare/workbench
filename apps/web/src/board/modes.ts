import { mode, type Mode } from "@workbench/shared";

// The three ways a person works a step with the AI, as the artboard names them.
// The modes themselves come from the shared schema (process/template.md).

/** The pill on a card and the legend entry. */
export const modeLabel: Record<Mode, string> = {
  manual: "I do it",
  assist: "AI assists",
  delegate: "AI does it",
};

/** The short form in a teammate's mode counts ("2 I do · 5 assist · 5 AI"). */
export const modeCountLabel: Record<Mode, string> = {
  manual: "I do",
  assist: "assist",
  delegate: "AI",
};

/** The legend's long form. */
export const modeMeaning: Record<Mode, string> = {
  manual: "I do it",
  assist: "AI assists, I drive",
  delegate: "AI does it, I verify",
};

export const modes: readonly Mode[] = mode.options;
