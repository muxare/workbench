import type { Mode } from "@workbench/shared";
import { modeLabel } from "./modes.ts";

export function ModePill({ mode }: { mode: Mode }) {
  return <span className={`pill pill--${mode}`}>{modeLabel[mode]}</span>;
}
