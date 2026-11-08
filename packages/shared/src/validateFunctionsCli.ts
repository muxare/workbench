// The TypeScript port of checks/validate_functions.py, run from the repo root:
//   node packages/shared/src/validateFunctionsCli.ts
// Prints the same lines and exits with the same code as the Python version.
import path from "node:path";
import { formatReport } from "./functionValidator.ts";
import { validateProcessDir } from "./node.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const report = validateProcessDir(root);
for (const line of formatReport(report)) console.log(line);
process.exitCode = report.errors.length > 0 ? 1 : 0;
