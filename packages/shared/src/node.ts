// Node-only helpers for reading function files from disk. Kept out of
// index.ts so apps/web never pulls in node:fs.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { FunctionFileError, parseFunctionFile, type FunctionFile } from "./functionFile.ts";
import { validateProcess, type ProcessFunctionFile, type ValidationReport } from "./functionValidator.ts";

export interface LoadedFunctionFile extends FunctionFile {
  path: string;
}

/**
 * Read and parse one function file, and check that its name matches the file
 * name and its role matches the folder, as process/template.md requires.
 */
export function loadFunctionFile(filePath: string): LoadedFunctionFile {
  const file = parseFunctionFile(readFileSync(filePath, "utf8"));
  const stem = path.basename(filePath, ".md");
  const folder = path.basename(path.dirname(filePath));
  if (file.frontMatter.name !== stem) {
    throw new FunctionFileError(`${filePath}: name '${file.frontMatter.name}' does not match file name '${stem}'`);
  }
  if (file.frontMatter.role !== folder) {
    throw new FunctionFileError(`${filePath}: role '${file.frontMatter.role}' does not match folder '${folder}'`);
  }
  return { ...file, path: filePath };
}

/** Every `<role>/<name>.md` path under a functions directory, sorted. */
export function functionFilePaths(functionsDir: string): string[] {
  return readdirSync(functionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((dir) =>
      readdirSync(path.join(functionsDir, dir.name))
        .filter((name) => name.endsWith(".md"))
        .map((name) => path.join(functionsDir, dir.name, name)),
    )
    .sort();
}

/** Load every function file under a functions directory, e.g. process/functions. */
export function loadFunctionFiles(functionsDir: string): LoadedFunctionFile[] {
  return functionFilePaths(functionsDir).map(loadFunctionFile);
}

/**
 * Run the port of checks/validate_functions.py over `<root>/process`, where
 * root is the repo root (or a copy of its layout, as the tests use).
 */
export function validateProcessDir(root: string): ValidationReport {
  const processDir = path.join(root, "process");
  const functionFiles: ProcessFunctionFile[] = functionFilePaths(path.join(processDir, "functions"))
    .map((filePath) => ({
      rel: path.relative(root, filePath).split(path.sep).join("/"),
      folder: path.basename(path.dirname(filePath)),
      stem: path.basename(filePath, ".md"),
      text: readFileSync(filePath, "utf8"),
    }))
    // Python sorts paths part by part, so `be/x.md` comes before `be-a/y.md`.
    .sort((a, b) => compare(a.folder, b.folder) || compare(a.stem + ".md", b.stem + ".md"));
  return validateProcess({
    templateText: readFileSync(path.join(processDir, "template.md"), "utf8"),
    artifactsText: readFileSync(path.join(processDir, "artifacts.md"), "utf8"),
    functionFiles,
  });
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
