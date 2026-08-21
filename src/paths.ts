import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Project, SourceFile } from "ts-morph";

export interface PartitionedInputs {
  files: string[];
  globs: string[];
}

// React/MUI code lives in .ts/.tsx but also plain .js/.jsx (CRA and v4-era
// codebases) and the ESM/CJS variants. ts-morph parses JSX in all of them.
const SOURCE_EXTENSIONS = ["ts", "tsx", "js", "jsx", "mjs", "cjs"];
const SOURCE_EXTENSION_RE = new RegExp(`\\.(${SOURCE_EXTENSIONS.join("|")})$`);
const SOURCE_GLOB_SUFFIX = `/**/*.{${SOURCE_EXTENSIONS.join(",")}}`;

export function partitionInputs(inputs: string[]): PartitionedInputs {
  const files: string[] = [];
  const globs: string[] = [];
  for (const input of inputs) {
    if (SOURCE_EXTENSION_RE.test(input)) {
      files.push(input);
    } else {
      globs.push(`${input.replace(/\/+$/, "")}${SOURCE_GLOB_SUFFIX}`);
    }
  }
  if (globs.length) globs.push("!**/node_modules/**");
  return { files, globs };
}

function walkDirectory(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkDirectory(full, out);
    else if (SOURCE_EXTENSION_RE.test(entry.name)) out.push(full);
  }
}

// Enumerate source file paths from the inputs WITHOUT parsing them (so the main
// pass can load them in batches instead of holding every AST in memory). Returns
// absolute paths, node_modules excluded.
export function listSourceFilePaths(inputs: string[]): string[] {
  const out: string[] = [];
  for (const input of inputs) {
    const stat = statSync(input, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isDirectory()) walkDirectory(input, out);
    else if (SOURCE_EXTENSION_RE.test(input)) out.push(input);
  }
  return [...new Set(out.map((p) => resolve(p)))];
}

export function collectSourceFiles(project: Project, inputs: string[]): SourceFile[] {
  const { files, globs } = partitionInputs(inputs);
  const byPath = new Map<string, SourceFile>();

  // Explicit files are added directly (no directory scan), so a single file does not
  // trigger a recursive walk of its parent directory.
  for (const file of files) {
    try {
      const sourceFile = project.addSourceFileAtPath(file);
      byPath.set(sourceFile.getFilePath(), sourceFile);
    } catch {
      // Missing explicit path; ignored and surfaced later as "no matching files".
    }
  }

  if (globs.length) {
    for (const sourceFile of project.addSourceFilesAtPaths(globs)) {
      byPath.set(sourceFile.getFilePath(), sourceFile);
    }
  }

  return [...byPath.values()];
}
