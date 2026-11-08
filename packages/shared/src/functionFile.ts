// Schema for function files in process/functions/<role>/<name>.md, following
// process/template.md (version 1). It covers the shape of one file: fields,
// enums and the rules that need nothing but the file itself. Rules that need
// another file (artifact ids in artifacts.md, `from` against `made_by`, the
// name and role against the path) live in the loader or the validator.
//
// This module is browser-safe: it parses text and never touches the file
// system. Reading files from disk is in ./node.ts.
import { parse as parseYaml } from "yaml";
import { z } from "zod";

/** The template version this schema follows; `template` in process/template.md. */
export const TEMPLATE_VERSION = 1;

export const functionRole = z.enum(["ux", "fe", "be", "team"]);
export type FunctionRole = z.infer<typeof functionRole>;

export const functionMode = z.enum(["manual", "assist", "delegate"]);
export type FunctionMode = z.infer<typeof functionMode>;

export const protocolActor = z.enum(["human", "ai", "both", "none"]);
export type ProtocolActor = z.infer<typeof protocolActor>;

export const ruleSeverity = z.enum(["error", "warning"]);
export type RuleSeverity = z.infer<typeof ruleSeverity>;

const text = z.string().trim().min(1);
const snakeCase = z.string().regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/, "must be snake_case");
const artifactId = text;
/** A function name, or `external` for artifacts made outside the chain. */
const source = snakeCase;

export const functionInput = z.strictObject({
  artifact: artifactId,
  required: z.boolean(),
  from: source,
});

export const functionContext = z.strictObject({
  artifact: artifactId,
  from: source,
});

export const functionOutput = z.strictObject({
  artifact: artifactId,
});

export const structuralRule = z.strictObject({
  id: text,
  rule: text,
  severity: ruleSeverity.optional(),
});

/** Consistency rules have no severity; the template keeps it for structural rules. */
export const consistencyRule = z.strictObject({
  id: text,
  rule: text,
});

export const humanCheck = z.strictObject({
  approver: text,
  where: text,
  criteria: text,
});

export const functionChecks = z.strictObject({
  structural: z.array(structuralRule).min(1, "checks.structural is empty"),
  consistency: z.array(consistencyRule).min(1, "checks.consistency is empty"),
  human: humanCheck,
});

/**
 * Who opens, asks, writes and decides in one mode. `note` is not in the
 * template's field table, but every function file uses it to say how the mode
 * plays out for that step, so the schema accepts it as optional prose.
 */
export const protocol = z.strictObject({
  opens: protocolActor,
  asks: protocolActor,
  writes: protocolActor,
  decides: z.literal("human"),
  note: text.optional(),
});
export type Protocol = z.infer<typeof protocol>;

export const writeBack = z.strictObject({
  artifact: artifactId,
  what: text,
});

export const functionFrontMatter = z
  .strictObject({
    template: z.literal(TEMPLATE_VERSION),
    name: snakeCase,
    role: functionRole,
    title: text,
    summary: text,
    inputs: z.array(functionInput),
    context: z.array(functionContext).optional(),
    tacit: z.array(text).optional(),
    outputs: z.array(functionOutput),
    checks: functionChecks,
    modes: z.strictObject({
      default: functionMode,
      allowed: z.array(functionMode).min(1),
    }),
    protocols: z.partialRecord(functionMode, protocol),
    decision_log: z.array(text),
    writes_back: z.array(writeBack).optional(),
  })
  .superRefine((fm, ctx) => {
    if (!fm.modes.allowed.includes(fm.modes.default)) {
      ctx.addIssue({
        code: "custom",
        path: ["modes", "default"],
        message: "modes.default is not in modes.allowed",
      });
    }
    for (const mode of fm.modes.allowed) {
      if (!fm.protocols[mode]) {
        ctx.addIssue({
          code: "custom",
          path: ["protocols", mode],
          message: `no protocol for allowed mode '${mode}'`,
        });
      }
    }
  });
export type FunctionFrontMatter = z.infer<typeof functionFrontMatter>;

/** Body headings every function file has, in this order (template.md, "Body sections"). */
export const FUNCTION_BODY_SECTIONS = [
  "## Purpose",
  "## How each mode plays out",
  "## Example",
  "## Open points",
] as const;

export interface FunctionFile {
  frontMatter: FunctionFrontMatter;
  body: string;
}

/** Thrown when a function file cannot be split or its front matter is not YAML. */
export class FunctionFileError extends Error {
  override name = "FunctionFileError";
}

/** Split a markdown file into raw YAML front matter and body, as the validator does. */
export function splitFrontMatter(fileText: string): { yaml: string; body: string } {
  const normalized = fileText.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    throw new FunctionFileError("no front matter");
  }
  const end = normalized.indexOf("\n---", 4);
  if (end < 0) {
    throw new FunctionFileError("front matter is not closed");
  }
  return { yaml: normalized.slice(4, end), body: normalized.slice(end + 4) };
}

/**
 * Parse the text of one function file. Throws FunctionFileError when the front
 * matter cannot be read or a body section is missing, and a ZodError when the
 * front matter does not match the template.
 */
export function parseFunctionFile(fileText: string): FunctionFile {
  const { yaml, body } = splitFrontMatter(fileText);
  let data: unknown;
  try {
    data = parseYaml(yaml) ?? {};
  } catch (error) {
    throw new FunctionFileError(`front matter is not valid YAML: ${(error as Error).message}`);
  }
  const frontMatter = functionFrontMatter.parse(data);
  const missing = FUNCTION_BODY_SECTIONS.filter((heading) => !body.includes(heading));
  if (missing.length > 0) {
    throw new FunctionFileError(`body has no ${missing.map((h) => `'${h}'`).join(", ")} section`);
  }
  return { frontMatter, body };
}
