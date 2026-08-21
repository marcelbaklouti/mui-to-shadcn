import { readFileSync } from "node:fs";
import { Project, ts } from "ts-morph";
import { collectMuiReexports } from "./imports.js";
import type { BarrelMap } from "./types.js";

// A re-export from an MUI barrel: `export … from "@mui/material"`. The bounded
// gap keeps it from matching a plain consumer (import from MUI + unrelated
// exports far apart) while still allowing long multi-name export lists.
const MUI_REEXPORT_RE =
  /\bexport\b[\s\S]{0,300}?\bfrom\s*['"](?:@mui\/(?:material|lab|system)|@material-ui\/(?:core|lab))(?:\/[^'"]*)?['"]/;

// Streaming pre-pass: parse only the files that plausibly re-export MUI, extract
// their re-export maps, and dispose each immediately. Peak memory stays at ~one
// file, so it composes with the batched main pass.
export function buildBarrelMap(paths: string[]): BarrelMap {
  const map: BarrelMap = new Map();
  const candidates = paths.filter((path) => {
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      return false;
    }
    return MUI_REEXPORT_RE.test(text);
  });
  if (candidates.length === 0) return map;

  const project = new Project({
    useInMemoryFileSystem: false,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, jsx: ts.JsxEmit.Preserve },
  });
  for (const path of candidates) {
    let sourceFile;
    try {
      sourceFile = project.addSourceFileAtPath(path);
    } catch {
      continue;
    }
    const exports = collectMuiReexports(sourceFile);
    if (exports.size) map.set(sourceFile.getFilePath(), exports);
    project.removeSourceFile(sourceFile);
  }
  return map;
}
