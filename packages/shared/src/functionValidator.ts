// The structural validator for the process model: it checks every function
// file against process/template.md and process/artifacts.md, and every
// artifact entry against the functions that make and read it. `pnpm validate`
// runs it from the repo root (validateFunctionsCli.ts).
//
// It began as a line-for-line port of the Python validator it replaced on
// 2026-11-08, and keeps that validator's checks and wording, including how
// values print (`True`, `None`, `['a', 'b']`) and which values count as empty.
// What it does differently from the Python is listed in docs/decisions.md.
// It never stops on a malformed file: anything it cannot read becomes an error
// line, and errors and notes come out sorted, so the output is stable.
//
// It does not run the zod schema in functionFile.ts, which is stricter (strict
// objects and the type of every field). It takes its enums, required fields
// and body sections from that schema instead of repeating them, and reads the
// current template version from process/template.md.
//
// This module is browser-safe: it works on text. Reading a process directory
// from disk is validateProcessDir in ./node.ts.
import { parse as parseYaml } from "yaml";
import {
  FUNCTION_BODY_SECTIONS,
  functionFrontMatter,
  functionMode,
  functionRole,
  humanCheck,
  protocol,
  protocolActor,
  splitFrontMatter,
} from "./functionFile.ts";

function requiredKeys(shape: Record<string, { safeParse(value: unknown): { success: boolean } }>): string[] {
  return Object.entries(shape)
    .filter(([, schema]) => !schema.safeParse(undefined).success)
    .map(([key]) => key);
}

const ROLES = new Set<string>(functionRole.options);
const MODES = new Set<string>(functionMode.options);
const ACTORS = new Set<string>(protocolActor.options);
/** `opens`, `asks`, `writes`, `decides`: the protocol fields that are not optional. */
const PROTOCOL_KEYS = requiredKeys(protocol.shape);
/** The front matter fields that are not optional, in template order. */
const REQUIRED = requiredKeys(functionFrontMatter.shape);
const HUMAN_CHECK_KEYS = Object.keys(humanCheck.shape);
const CHECK_LAYERS = ["structural", "consistency"] as const;
/** Fields every entry in process/artifacts.md must have. */
const ARTIFACT_KEYS = ["name", "owner", "made_by", "fields"] as const;
const SEVERITIES = ["error", "warning"];

// ---- Values, read and printed as the Python validator did ------------------

type Dict = Record<string, unknown>;
type Report = (msg: string) => void;

function isDict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function get(value: Dict, key: string, fallback: unknown = null): unknown {
  return Object.hasOwn(value, key) ? value[key] : fallback;
}

/** Empty values: null, false, 0, "", [] and {}. */
function truthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false || value === 0 || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isDict(value)) return Object.keys(value).length > 0;
  return true;
}

function or(value: unknown, fallback: unknown): unknown {
  return truthy(value) ? value : fallback;
}

/** An empty value as `{}`; anything else that is not a mapping is reported. */
function mapping(value: unknown, where: string, err: Report): Dict | null {
  const v = or(value, {});
  if (isDict(v)) return v;
  err(`${where} must be a mapping`);
  return null;
}

/** An empty value as `[]`; anything else that is not a list is reported. */
function list(value: unknown, where: string, err: Report): unknown[] | null {
  const v = or(value, []);
  if (Array.isArray(v)) return v;
  err(`${where} must be a list`);
  return null;
}

/** Equality where 1 == 1.0, and lists and mappings compare by content. */
function same(a: unknown, b: unknown): boolean {
  if (a === undefined) a = null;
  if (b === undefined) b = null;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (isDict(a) && isDict(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && same(a[k], b[k]));
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

/** A map key that is equal for values `same` treats as equal. */
function key(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "number") return `n:${value}`;
  if (typeof value === "string") return `s:${value}`;
  return `r:${pyRepr(value)}`;
}

function inSet(value: unknown, set: ReadonlySet<string>): boolean {
  return typeof value === "string" && set.has(value);
}

function quote(s: string): string {
  if (s.includes("'") && !s.includes('"')) return `"${s}"`;
  return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;
}

function pyNumber(n: number): string {
  if (Number.isNaN(n)) return "nan";
  if (!Number.isFinite(n)) return n > 0 ? "inf" : "-inf";
  return String(n);
}

/** A value inside a list or mapping: strings quoted. */
function pyRepr(value: unknown): string {
  if (typeof value === "string") return quote(value);
  if (Array.isArray(value)) return `[${value.map(pyRepr).join(", ")}]`;
  if (isDict(value)) return `{${Object.entries(value).map(([k, v]) => `${quote(k)}: ${pyRepr(v)}`).join(", ")}}`;
  return pyStr(value);
}

/** A value on its own in a message. */
function pyStr(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return pyNumber(value);
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return pyRepr(value);
}

function sortedForPrint(values: Iterable<unknown>): unknown[] {
  return [...values].sort((a, b) => {
    const x = typeof a === "string" ? a : pyStr(a);
    const y = typeof b === "string" ? b : pyStr(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

// ---- The validator ----------------------------------------------------------

/** One function file to validate. */
export interface ProcessFunctionFile {
  /** Path relative to the repo root, e.g. `process/functions/ux/frame_problem.md`. */
  rel: string;
  /** The folder name, which must equal the role. */
  folder: string;
  /** The file name without `.md`, which must equal the name. */
  stem: string;
  text: string;
}

export interface ProcessFiles {
  templateText: string;
  artifactsText: string;
  /** Sorted by folder, then by file name; the first file to use a name keeps it. */
  functionFiles: ProcessFunctionFile[];
}

export interface ValidationReport {
  /** Sorted. */
  errors: string[];
  /** Printed as `note: …`; sorted. */
  notes: string[];
  /** Function files whose front matter could be read. */
  functionCount: number;
  artifactCount: number;
}

/** Read front matter as YAML 1.1, like PyYAML; the reason as text when it cannot be read. */
function readFrontMatter(text: string): { fm: Dict; body: string } | { error: string } {
  let parts: { yaml: string; body: string };
  try {
    // CRLF and a lone CR both count as a line break.
    parts = splitFrontMatter(text.replace(/\r\n?/g, "\n"));
  } catch (error) {
    return { error: (error as Error).message };
  }
  let data: unknown;
  try {
    data = parseYaml(parts.yaml, { version: "1.1", uniqueKeys: false });
  } catch (error) {
    const firstLine = ((error as Error).message.split("\n")[0] ?? "").replace(/:$/, "");
    return { error: `front matter is not valid YAML: ${firstLine}` };
  }
  const fm = or(data, {});
  if (!isDict(fm)) return { error: "front matter is not a mapping" };
  return { fm, body: parts.body };
}

interface CheckedFunction {
  rel: string;
  /** Artifact ids in `outputs`. */
  outputs: unknown[];
  /** Artifact ids in `inputs` and `context`. */
  reads: unknown[];
}

/** Check one process tree: the template version, the artifact list and every function file. */
export function validateProcess(files: ProcessFiles): ValidationReport {
  const errors: string[] = [];
  const notes: string[] = [];

  let version: unknown = null;
  const template = readFrontMatter(files.templateText);
  if ("error" in template) errors.push(`template.md: ${template.error}`);
  else version = get(template.fm, "template");

  const artErr: Report = (msg) => errors.push(`artifacts.md: ${msg}`);
  const artifacts = new Map<string, { id: unknown; entry: Dict }>();
  const artMeta = readFrontMatter(files.artifactsText);
  if ("error" in artMeta) artErr(artMeta.error);
  const entries = "error" in artMeta ? [] : (list(get(artMeta.fm, "artifacts"), "artifacts", artErr) ?? []);
  entries.forEach((a, i) => {
    if (!isDict(a)) return artErr(`artifacts item ${i + 1} must be a mapping`);
    const id = get(a, "id");
    if (id === null || id === "") return artErr(`artifacts item ${i + 1} has no id`);
    if (Array.isArray(id) || isDict(id)) return artErr(`artifacts item ${i + 1} has an id that is not a single value`);
    if (artifacts.has(key(id))) artErr(`duplicate id ${pyStr(id)}`);
    artifacts.set(key(id), { id, entry: a });
    for (const k of ARTIFACT_KEYS) {
      if (!Object.hasOwn(a, k)) artErr(`${pyStr(id)} has no ${k}`);
    }
  });

  const checked: CheckedFunction[] = [];
  const byName = new Map<string, CheckedFunction>();
  for (const file of files.functionFiles) {
    const { rel } = file;
    const err: Report = (msg) => errors.push(`${rel}: ${msg}`);
    const parsed = readFrontMatter(file.text);
    if ("error" in parsed) {
      err(parsed.error);
      continue;
    }
    const { fm, body } = parsed;
    const record: CheckedFunction = { rel, outputs: [], reads: [] };
    checked.push(record);

    for (const k of REQUIRED) {
      if (!Object.hasOwn(fm, k)) err(`missing field '${k}'`);
    }
    // A YAML 1.1 boolean such as `yes` is not a version number.
    const fileVersion = get(fm, "template");
    if (typeof fileVersion === "boolean" || !same(fileVersion, version)) {
      err(`template is ${pyStr(fileVersion)}, current version is ${pyStr(version)}`);
    }
    const name = get(fm, "name");
    if (!same(name, file.stem)) {
      err(`name '${pyStr(name)}' does not match file name '${file.stem}'`);
    }
    if (typeof name === "string") {
      const earlier = byName.get(name);
      if (earlier) err(`name '${name}' is already used by ${earlier.rel}`);
      else byName.set(name, record);
    }
    const role = get(fm, "role");
    if (!same(role, file.folder) || !inSet(role, ROLES)) {
      err(`role '${pyStr(role)}' must match folder '${file.folder}' and be one of ${pyRepr(sortedForPrint(ROLES))}`);
    }

    for (const section of ["inputs", "context", "outputs"]) {
      (list(get(fm, section), section, err) ?? []).forEach((item, i) => {
        if (!isDict(item)) return err(`${section} item ${i + 1} must be a mapping`);
        const aid = get(item, "artifact");
        (section === "outputs" ? record.outputs : record.reads).push(aid);
        const known = artifacts.get(key(aid));
        if (!known) return err(`${section}: unknown artifact '${pyStr(aid)}'`);
        if (section === "inputs" && !Object.hasOwn(item, "required")) {
          err(`inputs: '${pyStr(aid)}' has no 'required'`);
        }
        // An artifact without made_by is reported once, in artifacts.md.
        if (section !== "outputs" && Object.hasOwn(known.entry, "made_by")) {
          const src = get(item, "from");
          const madeBy = known.entry.made_by;
          if (!same(src, madeBy)) {
            err(`${section}: '${pyStr(aid)}' says from '${pyStr(src)}', artifacts.md says made_by '${pyStr(madeBy)}'`);
          }
        }
      });
    }

    const checks = mapping(get(fm, "checks"), "checks", err);
    if (checks) {
      for (const layer of CHECK_LAYERS) {
        const rules = list(get(checks, layer), `checks.${layer}`, err);
        if (!rules) continue;
        if (rules.length === 0) err(`checks.${layer} is empty`);
        rules.forEach((rule, i) => {
          if (!isDict(rule)) return err(`checks.${layer} item ${i + 1} must be a mapping`);
          if (!truthy(get(rule, "id")) || !truthy(get(rule, "rule"))) {
            err(`checks.${layer}: every rule needs id and rule`);
          }
          const where = `checks.${layer}.${pyStr(get(rule, "id"))}`;
          if (Object.hasOwn(rule, "severity")) {
            const severity = rule.severity;
            if (severity === null || severity === "") {
              err(`${where}: severity is empty; write error or warning, or leave it out`);
            } else if (!SEVERITIES.some((s) => same(severity, s))) {
              err(`${where}: severity must be error or warning`);
            }
            if (layer === "consistency") err(`${where}: severity is only for structural rules`);
          }
        });
      }
      const human = mapping(get(checks, "human"), "checks.human", err);
      for (const k of HUMAN_CHECK_KEYS) {
        if (human && !truthy(get(human, k))) err(`checks.human has no ${k}`);
      }
    }

    const modes = mapping(get(fm, "modes"), "modes", err);
    const allowedList = modes ? list(get(modes, "allowed"), "modes.allowed", err) : null;
    const allowed = new Map<string, unknown>();
    for (const mode of allowedList ?? []) {
      if (!allowed.has(key(mode))) allowed.set(key(mode), mode);
    }
    const unknownModes = [...allowed.values()].filter((mode) => !inSet(mode, MODES));
    if (unknownModes.length > 0) {
      err(`modes.allowed has unknown modes ${pyRepr(sortedForPrint(unknownModes))}`);
    }
    if (modes && allowedList && !allowed.has(key(get(modes, "default")))) {
      err("modes.default is not in modes.allowed");
    }

    const protocols = mapping(get(fm, "protocols"), "protocols", err);
    if (protocols) {
      const allowedNames = new Set([...allowed.values()].map(pyStr));
      for (const mode of allowedNames) {
        const p = get(protocols, mode);
        if (!truthy(p)) {
          err(`protocols: no protocol for allowed mode '${mode}'`);
          continue;
        }
        if (!isDict(p)) continue; // reported below
        for (const k of PROTOCOL_KEYS) {
          if (!inSet(get(p, k), ACTORS)) {
            err(`protocols.${mode}.${k} must be one of ${pyRepr(sortedForPrint(ACTORS))}`);
          }
        }
      }
      // A human decides in every protocol, whether or not its mode is allowed.
      for (const [mode, p] of Object.entries(protocols)) {
        if (!truthy(p) && allowedNames.has(mode)) continue; // reported above
        if (truthy(p) && !isDict(p)) {
          err(`protocols.${mode} must be a mapping`);
          continue;
        }
        if (!same(isDict(p) ? get(p, "decides") : null, "human")) {
          err(`protocols.${mode}.decides must be human`);
        }
      }
    }

    (list(get(fm, "writes_back"), "writes_back", err) ?? []).forEach((item, i) => {
      if (!isDict(item)) return err(`writes_back item ${i + 1} must be a mapping`);
      if (!artifacts.has(key(get(item, "artifact")))) {
        err(`writes_back: unknown artifact '${pyStr(get(item, "artifact"))}'`);
      }
    });

    for (const heading of FUNCTION_BODY_SECTIONS) {
      if (!body.includes(heading)) err(`body has no '${heading}' section`);
    }
  }

  // Cross-checks between functions and the artifact list
  for (const { id: aid, entry } of artifacts.values()) {
    if (!Object.hasOwn(entry, "made_by")) continue; // reported above
    const maker = entry.made_by;
    const made = typeof maker === "string" ? byName.get(maker) : undefined;
    if (!made) continue;
    if (!made.outputs.some((o) => same(o, aid))) {
      errors.push(`artifacts.md: ${pyStr(aid)} made_by ${maker}, but ${made.rel} does not output it`);
    }
    if (!checked.some((f) => f.reads.some((i) => same(i, aid)))) {
      notes.push(`${pyStr(aid)} is made by ${maker} but no drafted function reads it yet`);
    }
  }

  return { errors: errors.sort(), notes: notes.sort(), functionCount: checked.length, artifactCount: artifacts.size };
}

/** The lines `pnpm validate` prints: notes, then errors, then a summary. */
export function formatReport(report: ValidationReport): string[] {
  return [
    ...report.notes.map((n) => `note: ${n}`),
    ...report.errors.map((e) => `error: ${e}`),
    `${report.functionCount} functions, ${report.artifactCount} artifacts, ` +
      `${report.errors.length} errors, ${report.notes.length} notes`,
  ];
}
