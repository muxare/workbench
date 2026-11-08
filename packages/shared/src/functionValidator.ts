// A TypeScript port of checks/validate_functions.py. It reports the same
// errors and notes, with the same wording, for the same process tree, so the
// two can be compared line by line (see functionValidator.test.ts).
//
// It deliberately enforces exactly what the Python validator enforces, no
// more and no less. That is why it does not run the zod schema in
// functionFile.ts, which is stricter (strict objects, snake_case names, types
// of every field). It takes its enums, required fields and body sections from
// that schema instead of repeating them, and reads the current template
// version from process/template.md, as the Python does.
//
// Python semantics that change the result are reproduced by the helpers
// below: truthiness (`or`, `not`), `==` between numbers and booleans, how
// `str()` and `repr()` print values, and iterating a dict or a string. Where
// the Python validator would crash with a traceback, this port throws
// ValidatorCrash rather than reporting something the Python never would.
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

/** The Python validator would stop with a traceback at this point. */
export class ValidatorCrash extends Error {
  override name = "ValidatorCrash";
}

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

/** The fixed lists the validator checks against, exported so a test can compare them with the Python's. */
export const VALIDATOR_RULES = {
  roles: [...ROLES],
  modes: [...MODES],
  actors: [...ACTORS],
  protocolKeys: PROTOCOL_KEYS,
  required: REQUIRED,
} as const;

// ---- Python semantics ---------------------------------------------------

type Dict = Record<string, unknown>;

function isDict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/** `value.get(key, fallback)`; crashes like Python when value is not a dict. */
function get(value: unknown, key: string, fallback: unknown = null): unknown {
  if (!isDict(value)) throw new ValidatorCrash(`'${typeName(value)}' object has no attribute 'get'`);
  return Object.hasOwn(value, key) ? value[key] : fallback;
}

/** `value[key]`; crashes like Python when the key is missing. */
function index(value: unknown, key: string): unknown {
  if (!isDict(value)) throw new ValidatorCrash(`'${typeName(value)}' object is not subscriptable`);
  if (!Object.hasOwn(value, key)) throw new ValidatorCrash(`KeyError: '${key}'`);
  return value[key];
}

/** `key in value` for a dict. */
function hasKey(value: unknown, key: string): boolean {
  if (isDict(value)) return Object.hasOwn(value, key);
  if (typeof value === "string") return value.includes(key);
  if (Array.isArray(value)) return value.some((item) => pyEq(item, key));
  throw new ValidatorCrash(`argument of type '${typeName(value)}' is not iterable`);
}

function typeName(value: unknown): string {
  if (value === null || value === undefined) return "NoneType";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  if (typeof value === "string") return "str";
  if (Array.isArray(value)) return "list";
  if (value instanceof Date) return "date";
  return "dict";
}

function truthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false || value === 0 || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isDict(value)) return Object.keys(value).length > 0;
  return true;
}

/** `value or fallback` */
function or(value: unknown, fallback: unknown): unknown {
  return truthy(value) ? value : fallback;
}

/** `for item in value`: lists give items, dicts their keys, strings their characters. */
function iter(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isDict(value)) return Object.keys(value);
  if (typeof value === "string") return [...value];
  throw new ValidatorCrash(`'${typeName(value)}' object is not iterable`);
}

/** Python `==`, where True == 1 and 1 == 1.0. */
function pyEq(a: unknown, b: unknown): boolean {
  const numeric = (v: unknown) => typeof v === "number" || typeof v === "boolean";
  if (numeric(a) && numeric(b)) return Number(a) === Number(b);
  if (a === undefined) a = null;
  if (b === undefined) b = null;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => pyEq(v, b[i]));
  if (isDict(a) && isDict(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && pyEq(a[k], b[k]));
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

/** A key for a Python set or dict: equal for values Python hashes as equal; crashes on unhashable values. */
function hashKey(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean" || typeof value === "number") return `n:${Number(value)}`;
  if (typeof value === "string") return `s:${value}`;
  if (value instanceof Date) return `d:${value.getTime()}`;
  throw new ValidatorCrash(`unhashable type: '${typeName(value)}'`);
}

/** `value in some_set_of_strings` */
function inSet(value: unknown, set: ReadonlySet<string>): boolean {
  hashKey(value);
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

/** `repr(value)` */
function pyRepr(value: unknown): string {
  if (typeof value === "string") return quote(value);
  if (Array.isArray(value)) return `[${value.map(pyRepr).join(", ")}]`;
  if (isDict(value)) return `{${Object.entries(value).map(([k, v]) => `${quote(k)}: ${pyRepr(v)}`).join(", ")}}`;
  return pyStr(value);
}

/** `str(value)`, as an f-string prints it. */
function pyStr(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return pyNumber(value);
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return pyRepr(value);
}

/** `sorted(values)` for the string sets the validator prints. */
function pySorted(values: Iterable<unknown>): unknown[] {
  return [...values].sort((a, b) => {
    const x = typeof a === "string" ? a : pyStr(a);
    const y = typeof b === "string" ? b : pyStr(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

// ---- The validator ------------------------------------------------------

/** One function file, as the Python validator sees it. */
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
  /** In the order the Python sorts them: by folder, then by file name. */
  functionFiles: ProcessFunctionFile[];
}

export interface ValidationReport {
  errors: string[];
  /** Printed by the Python as `note: …`; called warnings in its source. */
  notes: string[];
  functionCount: number;
  artifactCount: number;
}

/** Parse front matter the way PyYAML's safe_load does, as closely as the yaml package allows. */
function frontMatter(text: string): { fm: unknown; body: string } {
  // Python's read_text opens in universal-newline mode: CRLF and a lone CR both become LF.
  const { yaml, body } = splitFrontMatter(text.replace(/\r\n?/g, "\n"));
  let data: unknown;
  try {
    data = parseYaml(yaml, { version: "1.1", uniqueKeys: false });
  } catch (error) {
    throw new ValidatorCrash(`front matter is not valid YAML: ${(error as Error).message}`);
  }
  return { fm: or(data, {}), body };
}

/** Run every check in checks/validate_functions.py over one process tree. */
export function validateProcess(files: ProcessFiles): ValidationReport {
  const errors: string[] = [];
  const notes: string[] = [];
  const version = get(frontMatter(files.templateText).fm, "template");

  const artMeta = frontMatter(files.artifactsText).fm;
  const artifacts = new Map<string, { id: unknown; entry: unknown }>();
  for (const a of iter(get(artMeta, "artifacts", []))) {
    const id = index(a, "id");
    if (artifacts.has(hashKey(id))) errors.push(`artifacts.md: duplicate id ${pyStr(id)}`);
    artifacts.set(hashKey(id), { id, entry: a });
    for (const key of ARTIFACT_KEYS) {
      if (!hasKey(a, key)) errors.push(`artifacts.md: ${pyStr(id)} has no ${key}`);
    }
  }
  const artifact = (aid: unknown) => artifacts.get(hashKey(aid));

  const functions = new Map<string, { rel: string; fm: unknown }>();
  for (const file of files.functionFiles) {
    const { rel } = file;
    let fm: unknown;
    let body: string;
    try {
      ({ fm, body } = frontMatter(file.text));
    } catch (error) {
      if (error instanceof ValidatorCrash) throw error;
      errors.push(`${rel}: ${(error as Error).message}`);
      continue;
    }
    functions.set(hashKey(get(fm, "name")), { rel, fm });
    const err = (msg: string) => errors.push(`${rel}: ${msg}`);

    for (const key of REQUIRED) {
      if (!hasKey(fm, key)) err(`missing field '${key}'`);
    }
    if (!pyEq(get(fm, "template"), version)) {
      err(`template is ${pyStr(get(fm, "template"))}, current version is ${pyStr(version)}`);
    }
    if (!pyEq(get(fm, "name"), file.stem)) {
      err(`name '${pyStr(get(fm, "name"))}' does not match file name '${file.stem}'`);
    }
    if (!pyEq(get(fm, "role"), file.folder) || !inSet(get(fm, "role"), ROLES)) {
      err(
        `role '${pyStr(get(fm, "role"))}' must match folder '${file.folder}' and be one of ${pyRepr(pySorted(ROLES))}`,
      );
    }

    for (const section of ["inputs", "context", "outputs"]) {
      for (const item of iter(or(get(fm, section), []))) {
        const aid = get(item, "artifact");
        const known = artifact(aid);
        if (!known) {
          err(`${section}: unknown artifact '${pyStr(aid)}'`);
          continue;
        }
        if (section === "inputs" && !hasKey(item, "required")) {
          err(`inputs: '${pyStr(aid)}' has no 'required'`);
        }
        if (section === "inputs" || section === "context") {
          const src = get(item, "from");
          const madeBy = index(known.entry, "made_by");
          if (!pyEq(src, madeBy)) {
            err(`${section}: '${pyStr(aid)}' says from '${pyStr(src)}', artifacts.md says made_by '${pyStr(madeBy)}'`);
          }
        }
      }
    }

    const checks = or(get(fm, "checks"), {});
    for (const layer of CHECK_LAYERS) {
      const rules = or(get(checks, layer), []);
      if (!truthy(rules)) err(`checks.${layer} is empty`);
      for (const rule of iter(rules)) {
        if (!truthy(get(rule, "id")) || !truthy(get(rule, "rule"))) {
          err(`checks.${layer}: every rule needs id and rule`);
        }
        const severity = get(rule, "severity", "error");
        if (!SEVERITIES.some((s) => pyEq(severity, s))) {
          err(`checks.${layer}.${pyStr(get(rule, "id"))}: severity must be error or warning`);
        }
        if (layer === "consistency" && hasKey(rule, "severity")) {
          err(`checks.consistency.${pyStr(get(rule, "id"))}: severity is only for structural rules`);
        }
      }
    }
    const human = or(get(checks, "human"), {});
    for (const key of HUMAN_CHECK_KEYS) {
      if (!truthy(get(human, key))) err(`checks.human has no ${key}`);
    }

    const modes = or(get(fm, "modes"), {});
    // set(...): insertion order here; Python's order is its hash order.
    const allowed = new Map<string, unknown>();
    for (const mode of iter(or(get(modes, "allowed"), []))) {
      if (!allowed.has(hashKey(mode))) allowed.set(hashKey(mode), mode);
    }
    const unknownModes = [...allowed.values()].filter((mode) => !inSet(mode, MODES));
    if (unknownModes.length > 0) {
      err(`modes.allowed has unknown modes ${pyRepr(pySorted(unknownModes))}`);
    }
    if (!allowed.has(hashKey(get(modes, "default")))) {
      err("modes.default is not in modes.allowed");
    }
    const protocols = or(get(fm, "protocols"), {});
    for (const mode of allowed.values()) {
      const p = get(protocols, pyStr(mode));
      if (!truthy(p)) {
        err(`protocols: no protocol for allowed mode '${pyStr(mode)}'`);
        continue;
      }
      for (const key of PROTOCOL_KEYS) {
        if (!inSet(get(p, key), ACTORS)) {
          err(`protocols.${pyStr(mode)}.${key} must be one of ${pyRepr(pySorted(ACTORS))}`);
        }
      }
      if (!pyEq(get(p, "decides"), "human")) {
        err(`protocols.${pyStr(mode)}.decides must be human`);
      }
    }

    for (const item of iter(or(get(fm, "writes_back"), []))) {
      if (!artifact(get(item, "artifact"))) {
        err(`writes_back: unknown artifact '${pyStr(get(item, "artifact"))}'`);
      }
    }

    for (const heading of FUNCTION_BODY_SECTIONS) {
      if (!body.includes(heading)) err(`body has no '${heading}' section`);
    }
  }

  // Cross-checks between functions and the artifact list
  const outputIds = (fm: unknown) => iter(or(get(fm, "outputs"), [])).map((o) => get(o, "artifact"));
  // `(inputs or []) + (context or [])`: Python can only add two lists.
  const readIds = (fm: unknown) => {
    const inputs = or(get(fm, "inputs"), []);
    const context = or(get(fm, "context"), []);
    if (!Array.isArray(inputs) || !Array.isArray(context)) {
      throw new ValidatorCrash("can only concatenate list to list");
    }
    return [...inputs, ...context].map((i) => get(i, "artifact"));
  };
  for (const { id: aid, entry } of artifacts.values()) {
    const maker = index(entry, "made_by");
    const made = functions.get(hashKey(maker));
    if (made && !outputIds(made.fm).some((o) => pyEq(o, aid))) {
      errors.push(`artifacts.md: ${pyStr(aid)} made_by ${pyStr(maker)}, but ${made.rel} does not output it`);
    }
    const used = [...functions.values()].some(({ fm }) =>
      readIds(fm).some((i) => pyEq(i, aid)),
    );
    if (made && !used) {
      notes.push(`${pyStr(aid)} is made by ${pyStr(maker)} but no drafted function reads it yet`);
    }
  }

  return { errors, notes, functionCount: functions.size, artifactCount: artifacts.size };
}

/** The lines the Python validator prints, in its order. */
export function formatReport(report: ValidationReport): string[] {
  return [
    ...report.notes.map((n) => `note: ${n}`),
    ...report.errors.map((e) => `error: ${e}`),
    `${report.functionCount} functions, ${report.artifactCount} artifacts, ` +
      `${report.errors.length} errors, ${report.notes.length} notes`,
  ];
}
