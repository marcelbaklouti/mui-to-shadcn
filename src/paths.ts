import type { Project, SourceFile } from "ts-morph";

export interface PartitionedInputs {
  files: string[];
  globs: string[];
}

export function partitionInputs(inputs: string[]): PartitionedInputs {
  const files: string[] = [];
  const globs: string[] = [];
  for (const input of inputs) {
    if (/\.(ts|tsx)$/.test(input)) {
      files.push(input);
    } else {
      globs.push(`${input.replace(/\/+$/, "")}/**/*.{ts,tsx}`);
    }
  }
  if (globs.length) globs.push("!**/node_modules/**");
  return { files, globs };
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
