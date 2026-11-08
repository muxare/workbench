// Parity between checks/validate_functions.py and its TypeScript port. Both
// run over the real process/ tree and over a tree of deliberately broken,
// invented fixtures (packages/shared/test-fixtures/broken-process), and must
// print the same lines and exit with the same code.
//
// Lines are compared sorted: the Python loops over `set(modes.allowed)`, whose
// order depends on string hashing and changes from run to run.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VALIDATOR_RULES, ValidatorCrash, formatReport, validateProcess } from "./functionValidator.ts";
import { validateProcessDir } from "./node.ts";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const pythonScript = path.join(repoRoot, "checks/validate_functions.py");
const fixtureProcess = path.resolve(import.meta.dirname, "../test-fixtures/broken-process/process");

interface Run {
  lines: string[];
  exitCode: number;
}

// The Python finds process/ next to its own checks/ folder, so a copy of the
// script in a temporary tree validates that tree without any change to it.
function runPython(root: string): Run {
  const result = spawnSync("python3", [path.join(root, "checks/validate_functions.py")], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.stderr) throw new Error(`python validator crashed:\n${result.stderr}`);
  return { lines: result.stdout.trimEnd().split("\n"), exitCode: result.status ?? -1 };
}

function runTypeScript(root: string): Run {
  const report = validateProcessDir(root);
  return { lines: formatReport(report), exitCode: report.errors.length > 0 ? 1 : 0 };
}

function sorted(run: Run): Run {
  return { lines: [...run.lines].sort(), exitCode: run.exitCode };
}

function pythonTuple(name: string): string[] {
  const source = readFileSync(pythonScript, "utf8");
  const match = new RegExp(`^${name} = [({]([^)}]*)[)}]`, "m").exec(source);
  if (!match) throw new Error(`${name} not found in validate_functions.py`);
  return [...match[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

describe("validator rules", () => {
  it.each([
    ["ROLES", VALIDATOR_RULES.roles],
    ["MODES", VALIDATOR_RULES.modes],
    ["ACTORS", VALIDATOR_RULES.actors],
  ])("%s matches the Python set", (name, values) => {
    expect([...values].sort()).toEqual(pythonTuple(name).sort());
  });

  it.each([
    ["PROTOCOL_KEYS", VALIDATOR_RULES.protocolKeys],
    ["REQUIRED", VALIDATOR_RULES.required],
  ])("%s matches the Python tuple, in order", (name, values) => {
    expect(values).toEqual(pythonTuple(name));
  });
});

describe("parity on the real process tree", () => {
  it("reports the same lines and exit code as the Python validator", () => {
    const ts = runTypeScript(repoRoot);
    expect(ts.exitCode).toBe(0);
    expect(sorted(ts)).toEqual(sorted(runPython(repoRoot)));
  });
});

describe("parity on broken fixtures", () => {
  let root: string;
  let python: Run;
  let ts: Run;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "workbench-validator-"));
    cpSync(pythonScript, path.join(root, "checks/validate_functions.py"));
    cpSync(fixtureProcess, path.join(root, "process"), { recursive: true });
    cpSync(path.join(repoRoot, "process/template.md"), path.join(root, "process/template.md"));
    // Written here rather than committed, so git cannot change its line endings.
    // Python reads text in universal-newline mode, so CRLF and lone CR files
    // parse like LF files; these two then fail on their missing fields.
    writeFileSync(
      path.join(root, "process/functions/ux/crlf.md"),
      "---\r\n# Invented fixture: CRLF line endings.\r\ntemplate: 1\r\nname: crlf\r\nrole: ux\r\n---\r\n",
    );
    writeFileSync(
      path.join(root, "process/functions/ux/lone_cr.md"),
      "---\r# Invented fixture: lone CR line endings.\rtemplate: 1\rname: lone_cr\rrole: ux\r---\r",
    );
    python = runPython(root);
    ts = runTypeScript(root);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reports the same lines and exit code as the Python validator", () => {
    expect(ts.exitCode).toBe(1);
    expect(sorted(ts)).toEqual(sorted(python));
  });

  // Guards the fixtures: if one stops being broken, parity would be shown on less.
  it.each([
    ["no front matter", /ux\/no_front_matter\.md: no front matter/],
    ["CRLF line endings", /ux\/crlf\.md: missing field 'title'/],
    ["lone CR line endings", /ux\/lone_cr\.md: missing field 'title'/],
    ["front matter not closed", /front matter is not closed/],
    ["duplicate artifact id", /artifacts\.md: duplicate id brief/],
    ["artifact without a field", /artifacts\.md: notes has no owner/],
    ["missing field", /missing field 'summary'/],
    ["template version", /template is 2, current version is 1/],
    ["name and file name", /name 'other_name' does not match/],
    ["role and folder", /fe\/missing_fields\.md: role 'ux' must match folder 'fe'/],
    ["unknown role", /qa\/unknown_role\.md: role 'qa' must match folder 'qa'/],
    ["unknown artifact", /inputs: unknown artifact 'moodboard'/],
    ["input without required", /inputs: 'sketch' has no 'required'/],
    ["from against made_by", /context: 'style_guide' says from 'refine_ui_spec'/],
    ["empty rule layer", /checks\.consistency is empty/],
    ["rule without id or rule", /checks\.structural: every rule needs id and rule/],
    ["unknown severity", /checks\.structural\.fatal_rule: severity must be error or warning/],
    ["empty severity", /checks\.structural\.null_severity: severity must be error or warning/],
    ["severity on a consistency rule", /checks\.consistency\.has_severity: severity is only for structural rules/],
    ["human check", /checks\.human has no where/],
    ["unknown mode", /modes\.allowed has unknown modes \['autopilot'\]/],
    ["string as allowed modes", /modes\.allowed has unknown modes \['a', 'l', 'm', 'n', 'u'\]/],
    ["default not allowed", /modes\.default is not in modes\.allowed/],
    ["allowed mode without a protocol", /no protocol for allowed mode 'autopilot'/],
    ["unknown actor", /protocols\.manual\.asks must be one of/],
    ["missing actor", /protocols\.assist\.asks must be one of/],
    ["decides is not human", /protocols\.manual\.decides must be human/],
    ["decides is both", /protocols\.assist\.decides must be human/],
    ["unknown writes_back artifact", /writes_back: unknown artifact 'glossary'/],
    ["body section", /body has no '## Purpose' section/],
    ["artifact not output by its maker", /artifacts\.md: notes made_by draft_sketch, but .* does not output it/],
    ["artifact no function reads", /^note: /],
  ])("covers %s", (_name, pattern) => {
    expect(ts.lines.some((line) => pattern.test(line))).toBe(true);
  });
});

describe("validateProcess", () => {
  it("throws where the Python would crash, instead of reporting an error", () => {
    const template = readFileSync(path.join(repoRoot, "process/template.md"), "utf8");
    // An artifact without made_by: the Python reports it, then fails on a["made_by"].
    const artifactsText = "---\nartifacts:\n  - id: invented\n    name: Invented\n    owner: team\n    fields: []\n---\n";
    expect(() => validateProcess({ templateText: template, artifactsText, functionFiles: [] })).toThrow(
      ValidatorCrash,
    );
  });
});
