// Node-only helpers for reading function files from disk. Kept out of
// index.ts so apps/web never pulls in node:fs.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { FunctionFileError, parseFunctionFile, type FunctionFile } from "./functionFile.ts";

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
