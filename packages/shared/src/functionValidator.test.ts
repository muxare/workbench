// Pins what the function validator reports. It runs over the real process/
// tree, which must pass, and over a tree of deliberately broken, invented
// fixtures (packages/shared/test-fixtures/broken-process), whose every error
// and note line is listed below, so any change in behaviour shows up here.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatReport, validateProcess } from "./functionValidator.ts";
import { validateProcessDir } from "./node.ts";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const fixtureProcess = path.resolve(import.meta.dirname, "../test-fixtures/broken-process/process");
const templateText = readFileSync(path.join(repoRoot, "process/template.md"), "utf8");

describe("the real process tree", () => {
  it("passes with no errors", () => {
    const report = validateProcessDir(repoRoot);
    expect(report.errors).toEqual([]);
    expect(report.functionCount).toBeGreaterThan(0);
  });
});

describe("broken fixtures", () => {
  let root: string;
  let lines: string[];

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "workbench-validator-"));
    cpSync(fixtureProcess, path.join(root, "process"), { recursive: true });
    cpSync(path.join(repoRoot, "process/template.md"), path.join(root, "process/template.md"));
    // Written here rather than committed, so git cannot change their line
    // endings. CRLF and lone CR count as line breaks, so these two parse and
    // then fail on their missing fields.
    writeFileSync(
      path.join(root, "process/functions/ux/crlf.md"),
      "---\r\n# Invented fixture: CRLF line endings.\r\ntemplate: 1\r\nname: crlf\r\nrole: ux\r\n---\r\n",
    );
    writeFileSync(
      path.join(root, "process/functions/ux/lone_cr.md"),
      "---\r# Invented fixture: lone CR line endings.\rtemplate: 1\rname: lone_cr\rrole: ux\r---\r",
    );
    lines = formatReport(validateProcessDir(root));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reports exactly these lines, sorted", () => {
    expect(lines).toEqual([
      "note: handout is made by draft_sketch but no drafted function reads it yet",
      "note: notes is made by draft_sketch but no drafted function reads it yet",
      "error: artifacts.md: artifacts item 10 has no id",
      "error: artifacts.md: artifacts item 9 must be a mapping",
      "error: artifacts.md: duplicate id brief",
      "error: artifacts.md: loose_notes has no made_by",
      "error: artifacts.md: notes has no fields",
      "error: artifacts.md: notes has no owner",
      "error: artifacts.md: notes made_by draft_sketch, but process/functions/ux/draft_sketch.md does not output it",
      "error: process/functions/be/bad_modes.md: modes.allowed has unknown modes ['autopilot']",
      "error: process/functions/be/bad_modes.md: modes.default is not in modes.allowed",
      "error: process/functions/be/bad_modes.md: protocols.assist.asks must be one of ['ai', 'both', 'human', 'none']",
      "error: process/functions/be/bad_modes.md: protocols.assist.decides must be human",
      "error: process/functions/be/bad_modes.md: protocols.manual.asks must be one of ['ai', 'both', 'human', 'none']",
      "error: process/functions/be/bad_modes.md: protocols.manual.decides must be human",
      "error: process/functions/be/bad_modes.md: protocols: no protocol for allowed mode 'autopilot'",
      "error: process/functions/be/bad_yaml.md: front matter is not valid YAML: Flow sequence in block collection must be sufficiently indented and end with a ] at line 4, column 21",
      "error: process/functions/be/extra_protocol.md: protocols.assist.decides must be human",
      "error: process/functions/be/extra_protocol.md: protocols.delegate.decides must be human",
      "error: process/functions/be/list_front_matter.md: front matter is not a mapping",
      "error: process/functions/be/odd_values.md: modes.allowed must be a list",
      "error: process/functions/be/odd_values.md: template is True, current version is 1",
      "error: process/functions/fe/missing_fields.md: body has no '## Example' section",
      "error: process/functions/fe/missing_fields.md: body has no '## How each mode plays out' section",
      "error: process/functions/fe/missing_fields.md: body has no '## Open points' section",
      "error: process/functions/fe/missing_fields.md: body has no '## Purpose' section",
      "error: process/functions/fe/missing_fields.md: checks.consistency is empty",
      "error: process/functions/fe/missing_fields.md: checks.human has no approver",
      "error: process/functions/fe/missing_fields.md: checks.human has no criteria",
      "error: process/functions/fe/missing_fields.md: checks.human has no where",
      "error: process/functions/fe/missing_fields.md: checks.structural is empty",
      "error: process/functions/fe/missing_fields.md: missing field 'checks'",
      "error: process/functions/fe/missing_fields.md: missing field 'decision_log'",
      "error: process/functions/fe/missing_fields.md: missing field 'inputs'",
      "error: process/functions/fe/missing_fields.md: missing field 'outputs'",
      "error: process/functions/fe/missing_fields.md: missing field 'protocols'",
      "error: process/functions/fe/missing_fields.md: missing field 'summary'",
      "error: process/functions/fe/missing_fields.md: modes.default is not in modes.allowed",
      "error: process/functions/fe/missing_fields.md: name 'other_name' does not match file name 'missing_fields'",
      "error: process/functions/fe/missing_fields.md: role 'ux' must match folder 'fe' and be one of ['be', 'fe', 'team', 'ux']",
      "error: process/functions/fe/missing_fields.md: template is 2, current version is 1",
      "error: process/functions/qa/unknown_role.md: role 'qa' must match folder 'qa' and be one of ['be', 'fe', 'team', 'ux']",
      "error: process/functions/team/bad_checks.md: checks.consistency.has_severity: severity is only for structural rules",
      "error: process/functions/team/bad_checks.md: checks.human has no criteria",
      "error: process/functions/team/bad_checks.md: checks.human has no where",
      "error: process/functions/team/bad_checks.md: checks.structural.fatal_rule: severity must be error or warning",
      "error: process/functions/team/bad_checks.md: checks.structural.null_severity: severity is empty; write error or warning, or leave it out",
      "error: process/functions/team/bad_checks.md: checks.structural: every rule needs id and rule",
      "error: process/functions/team/bad_checks.md: checks.structural: every rule needs id and rule",
      "error: process/functions/team/empty_checks.md: checks.consistency is empty",
      "error: process/functions/team/empty_checks.md: checks.human has no approver",
      "error: process/functions/team/empty_checks.md: checks.human has no criteria",
      "error: process/functions/team/empty_checks.md: checks.human has no where",
      "error: process/functions/team/empty_checks.md: checks.structural is empty",
      "error: process/functions/team/wrong_sections.md: checks must be a mapping",
      "error: process/functions/team/wrong_sections.md: modes must be a mapping",
      "error: process/functions/team/wrong_sections.md: protocols must be a mapping",
      "error: process/functions/team/wrong_shapes.md: checks.consistency must be a list",
      "error: process/functions/team/wrong_shapes.md: checks.human must be a mapping",
      "error: process/functions/team/wrong_shapes.md: checks.structural must be a list",
      "error: process/functions/team/wrong_shapes.md: context must be a list",
      "error: process/functions/team/wrong_shapes.md: inputs must be a list",
      "error: process/functions/team/wrong_shapes.md: outputs item 1 must be a mapping",
      "error: process/functions/team/wrong_shapes.md: protocols.manual must be a mapping",
      "error: process/functions/team/wrong_shapes.md: writes_back must be a list",
      "error: process/functions/ux/crlf.md: body has no '## Example' section",
      "error: process/functions/ux/crlf.md: body has no '## How each mode plays out' section",
      "error: process/functions/ux/crlf.md: body has no '## Open points' section",
      "error: process/functions/ux/crlf.md: body has no '## Purpose' section",
      "error: process/functions/ux/crlf.md: checks.consistency is empty",
      "error: process/functions/ux/crlf.md: checks.human has no approver",
      "error: process/functions/ux/crlf.md: checks.human has no criteria",
      "error: process/functions/ux/crlf.md: checks.human has no where",
      "error: process/functions/ux/crlf.md: checks.structural is empty",
      "error: process/functions/ux/crlf.md: missing field 'checks'",
      "error: process/functions/ux/crlf.md: missing field 'decision_log'",
      "error: process/functions/ux/crlf.md: missing field 'inputs'",
      "error: process/functions/ux/crlf.md: missing field 'modes'",
      "error: process/functions/ux/crlf.md: missing field 'outputs'",
      "error: process/functions/ux/crlf.md: missing field 'protocols'",
      "error: process/functions/ux/crlf.md: missing field 'summary'",
      "error: process/functions/ux/crlf.md: missing field 'title'",
      "error: process/functions/ux/crlf.md: modes.default is not in modes.allowed",
      "error: process/functions/ux/draft_sketch.md: context: 'style_guide' says from 'refine_ui_spec', artifacts.md says made_by 'external'",
      "error: process/functions/ux/draft_sketch.md: context: unknown artifact 'palette'",
      "error: process/functions/ux/draft_sketch.md: inputs: 'plan' says from 'external', artifacts.md says made_by 'draft_sketch'",
      "error: process/functions/ux/draft_sketch.md: inputs: 'sketch' has no 'required'",
      "error: process/functions/ux/draft_sketch.md: inputs: unknown artifact 'moodboard'",
      "error: process/functions/ux/draft_sketch.md: outputs: unknown artifact 'storyboard'",
      "error: process/functions/ux/draft_sketch.md: writes_back: unknown artifact 'glossary'",
      "error: process/functions/ux/lone_cr.md: body has no '## Example' section",
      "error: process/functions/ux/lone_cr.md: body has no '## How each mode plays out' section",
      "error: process/functions/ux/lone_cr.md: body has no '## Open points' section",
      "error: process/functions/ux/lone_cr.md: body has no '## Purpose' section",
      "error: process/functions/ux/lone_cr.md: checks.consistency is empty",
      "error: process/functions/ux/lone_cr.md: checks.human has no approver",
      "error: process/functions/ux/lone_cr.md: checks.human has no criteria",
      "error: process/functions/ux/lone_cr.md: checks.human has no where",
      "error: process/functions/ux/lone_cr.md: checks.structural is empty",
      "error: process/functions/ux/lone_cr.md: missing field 'checks'",
      "error: process/functions/ux/lone_cr.md: missing field 'decision_log'",
      "error: process/functions/ux/lone_cr.md: missing field 'inputs'",
      "error: process/functions/ux/lone_cr.md: missing field 'modes'",
      "error: process/functions/ux/lone_cr.md: missing field 'outputs'",
      "error: process/functions/ux/lone_cr.md: missing field 'protocols'",
      "error: process/functions/ux/lone_cr.md: missing field 'summary'",
      "error: process/functions/ux/lone_cr.md: missing field 'title'",
      "error: process/functions/ux/lone_cr.md: modes.default is not in modes.allowed",
      "error: process/functions/ux/no_front_matter.md: no front matter",
      "error: process/functions/ux/not_closed.md: front matter is not closed",
      "error: process/functions/ux/zz_duplicate.md: name 'draft_sketch' does not match file name 'zz_duplicate'",
      "error: process/functions/ux/zz_duplicate.md: name 'draft_sketch' is already used by process/functions/ux/draft_sketch.md",
      "13 functions, 7 artifacts, 110 errors, 2 notes",
    ]);
  });
});

describe("validateProcess", () => {
  const sketch = (text: string) => ({ rel: "process/functions/ux/sketch.md", folder: "ux", stem: "sketch", text });

  it("reports an unreadable template.md and artifacts.md instead of throwing", () => {
    const report = validateProcess({
      templateText: "# No front matter (invented)\n",
      artifactsText: "---\nartifacts: [unclosed\n---\n",
      functionFiles: [],
    });
    expect(report.errors).toEqual([
      expect.stringMatching(/^artifacts\.md: front matter is not valid YAML: /),
      "template.md: no front matter",
    ]);
    expect(report.artifactCount).toBe(0);
  });

  it("reports artifacts that are not a list", () => {
    const report = validateProcess({ templateText, artifactsText: "---\nartifacts: invented\n---\n", functionFiles: [] });
    expect(report.errors).toEqual(["artifacts.md: artifacts must be a list"]);
  });

  it("gives the same sorted output whatever order the files come in", () => {
    const artifactsText = "---\nartifacts: []\n---\n";
    const files = [sketch("# none\n"), { ...sketch("---\ntemplate: 1\n---\n"), rel: "process/functions/fe/a.md" }];
    const forward = validateProcess({ templateText, artifactsText, functionFiles: files });
    const backward = validateProcess({ templateText, artifactsText, functionFiles: [...files].reverse() });
    expect(forward.errors.length).toBeGreaterThan(1);
    expect(forward.errors).toEqual(backward.errors);
    expect(forward.errors).toEqual([...forward.errors].sort());
  });
});
