import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  FunctionFileError,
  TEMPLATE_VERSION,
  functionFrontMatter,
  parseFunctionFile,
  splitFrontMatter,
} from "./index.ts";
import { functionFilePaths, loadFunctionFile } from "./node.ts";

const processDir = path.resolve(import.meta.dirname, "../../../process");
const functionsDir = path.join(processDir, "functions");
const paths = functionFilePaths(functionsDir);

// A valid front matter to break in the negative cases: the first real file.
function validFrontMatter(): Record<string, unknown> {
  const first = paths[0];
  if (!first) throw new Error("no function files found");
  return parseYaml(splitFrontMatter(readFileSync(first, "utf8")).yaml) as Record<string, unknown>;
}

function issuePaths(data: unknown): string[] {
  const result = functionFrontMatter.safeParse(data);
  expect(result.success).toBe(false);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

describe("function files in process/functions", () => {
  it("finds function files", () => {
    expect(paths.length).toBeGreaterThan(0);
  });

  it.each(paths.map((p) => [path.relative(processDir, p), p]))("%s parses", (_rel, filePath) => {
    const file = loadFunctionFile(filePath);
    expect(file.frontMatter.template).toBe(TEMPLATE_VERSION);
  });

  it("follows the template version in process/template.md", () => {
    const template = parseYaml(splitFrontMatter(readFileSync(path.join(processDir, "template.md"), "utf8")).yaml);
    expect(template.template).toBe(TEMPLATE_VERSION);
  });
});

describe("functionFrontMatter", () => {
  it("rejects an unknown mode", () => {
    const fm = validFrontMatter();
    fm.modes = { default: "autopilot", allowed: ["manual", "autopilot"] };
    expect(issuePaths(fm)).toEqual(expect.arrayContaining(["modes.default", "modes.allowed.1"]));
  });

  it("rejects a protocol where decides is not human", () => {
    const fm = validFrontMatter();
    const protocols = fm.protocols as Record<string, Record<string, unknown>>;
    const mode = Object.keys(protocols)[0]!;
    protocols[mode]!.decides = "ai";
    expect(issuePaths(fm)).toContain(`protocols.${mode}.decides`);
  });

  it("rejects a missing required field", () => {
    const fm = validFrontMatter();
    delete fm.decision_log;
    expect(issuePaths(fm)).toContain("decision_log");
  });

  it("rejects an allowed mode without a protocol", () => {
    const fm = validFrontMatter();
    fm.modes = { default: "manual", allowed: ["manual", "assist"] };
    fm.protocols = { manual: (fm.protocols as Record<string, unknown>).manual };
    expect(issuePaths(fm)).toContain("protocols.assist");
  });

  it("rejects a default mode that is not allowed", () => {
    const fm = validFrontMatter();
    fm.modes = { default: "delegate", allowed: ["manual"] };
    expect(issuePaths(fm)).toContain("modes.default");
  });

  it("rejects severity on a consistency rule and an unknown severity", () => {
    const fm = validFrontMatter();
    const checks = fm.checks as { structural: Record<string, unknown>[]; consistency: Record<string, unknown>[] };
    checks.structural[0]!.severity = "fatal";
    checks.consistency[0]!.severity = "warning";
    expect(issuePaths(fm)).toEqual(
      expect.arrayContaining(["checks.structural.0.severity", "checks.consistency.0"]),
    );
  });

  it("rejects an input without required", () => {
    const fm = validFrontMatter();
    const inputs = fm.inputs as Record<string, unknown>[];
    delete inputs[0]!.required;
    expect(issuePaths(fm)).toContain("inputs.0.required");
  });
});

describe("parseFunctionFile", () => {
  it("rejects text without front matter", () => {
    expect(() => parseFunctionFile("# Just a heading\n")).toThrow(FunctionFileError);
  });

  it("rejects a body without the template's sections", () => {
    const text = readFileSync(paths[0]!, "utf8").replace("## Open points", "## Later");
    expect(() => parseFunctionFile(text)).toThrow(/Open points/);
  });
});
