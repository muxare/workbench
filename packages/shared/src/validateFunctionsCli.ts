// The process validator from the command line, run from the repo root as
// `pnpm validate`. Prints notes, errors and a summary; exits 1 on any error.
import path from "node:path";
import { formatReport } from "./functionValidator.ts";
import { validateProcessDir } from "./node.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const report = validateProcessDir(root);
for (const line of formatReport(report)) console.log(line);
process.exitCode = report.errors.length > 0 ? 1 : 0;
