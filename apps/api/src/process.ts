// Reads the function definitions from process/ at the repo root. The app never
// lists functions itself; which ones exist is whatever process/functions holds.
import { fileURLToPath } from "node:url";
import { loadFunctionFiles } from "@workbench/shared/node";

export const functionsDir = fileURLToPath(new URL("../../../process/functions", import.meta.url));

/** The `name` of every function file under process/functions. */
export function loadFunctionIds(dir: string = functionsDir): Set<string> {
  return new Set(loadFunctionFiles(dir).map((f) => f.frontMatter.name));
}
