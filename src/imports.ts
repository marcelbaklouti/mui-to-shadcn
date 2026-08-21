import { dirname, join, resolve } from "node:path";
import type { ImportDeclaration, SourceFile } from "ts-morph";
import type { Edit } from "./edits.js";
import type { BarrelMap, ImportRequest } from "./types.js";

const MUI_BARRELS = [
  "@mui/material",
  "@mui/lab",
  // @mui/system re-exports Box/Stack/Container/Grid; non-component exports
  // (styled, useTheme, sx helpers) are never JSX tags, so they are ignored by
  // the component/sx passes and left in place by the import trimmer.
  "@mui/system",
  // v4 packages: component names are identical to v5.
  "@material-ui/core",
  "@material-ui/lab",
];

function matchBarrel(moduleSpecifier: string): { barrel: string; deep: boolean } | null {
  for (const barrel of MUI_BARRELS) {
    if (moduleSpecifier === barrel) return { barrel, deep: false };
    if (moduleSpecifier.startsWith(barrel + "/")) return { barrel, deep: true };
  }
  return null;
}

export interface MuiBinding {
  localName: string;
  canonicalName: string;
}

// For a barrel file, map each name it re-exports from an @mui/@material-ui
// barrel to the canonical MUI component name. Handles named, aliased, deep, and
// blanket (`export *`) re-exports.
export function collectMuiReexports(sourceFile: SourceFile): Map<string, string> {
  const exports = new Map<string, string>();
  for (const declaration of sourceFile.getExportDeclarations()) {
    const moduleSpecifier = declaration.getModuleSpecifierValue();
    if (!moduleSpecifier) continue;
    const matched = matchBarrel(moduleSpecifier);
    if (!matched) continue;
    const named = declaration.getNamedExports();
    if (named.length === 0 && !declaration.getNamespaceExport()) {
      // export * from "@mui/material" — the barrel re-exports every MUI name.
      exports.set("*", "*");
      continue;
    }
    const deepCanonical = matched.deep ? (moduleSpecifier.slice(matched.barrel.length + 1).split("/")[0] ?? "") : "";
    for (const entry of named) {
      const name = entry.getNameNode().getText();
      const exportedName = entry.getAliasNode()?.getText() ?? name;
      const canonical = matched.deep && name === "default" ? deepCanonical : name;
      if (exportedName && canonical) exports.set(exportedName, canonical);
    }
  }
  return exports;
}

// Resolve a relative import specifier from `fromFilePath` to a barrel file path
// present in `barrelMap` (trying the usual extensions and index files).
function resolveBarrelPath(fromFilePath: string, specifier: string, barrelMap: BarrelMap): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = resolve(dirname(fromFilePath), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
    join(base, "index.js"),
    join(base, "index.jsx"),
  ];
  for (const candidate of candidates) {
    if (barrelMap.has(candidate)) return candidate;
  }
  return undefined;
}

function canonicalFromBarrel(exports: Map<string, string>, importedName: string): string | undefined {
  const direct = exports.get(importedName);
  if (direct) return direct;
  return exports.has("*") ? importedName : undefined;
}

export function collectMuiBindings(sourceFile: SourceFile, barrelMap?: BarrelMap): MuiBinding[] {
  const bindings: MuiBinding[] = [];
  const fromPath = barrelMap && barrelMap.size ? sourceFile.getFilePath() : "";
  for (const declaration of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = declaration.getModuleSpecifierValue();
    const matched = matchBarrel(moduleSpecifier);
    if (!matched) {
      // Resolve imports that come through a local re-export barrel.
      if (!barrelMap || !barrelMap.size) continue;
      const barrelPath = resolveBarrelPath(fromPath, moduleSpecifier, barrelMap);
      if (!barrelPath) continue;
      const exports = barrelMap.get(barrelPath)!;
      for (const named of declaration.getNamedImports()) {
        const canonicalName = canonicalFromBarrel(exports, named.getNameNode().getText());
        if (!canonicalName) continue;
        const alias = named.getAliasNode();
        bindings.push({ localName: alias ? alias.getText() : named.getNameNode().getText(), canonicalName });
      }
      continue;
    }
    if (!matched.deep) {
      for (const named of declaration.getNamedImports()) {
        const canonicalName = named.getNameNode().getText();
        const alias = named.getAliasNode();
        bindings.push({
          localName: alias ? alias.getText() : canonicalName,
          canonicalName,
        });
      }
    } else {
      const segment = moduleSpecifier.slice(matched.barrel.length + 1);
      const canonicalName = segment.split("/")[0] ?? "";
      const defaultImport = declaration.getDefaultImport();
      if (defaultImport && canonicalName) {
        bindings.push({ localName: defaultImport.getText(), canonicalName });
      }
    }
  }
  return bindings;
}

function trailingNewlineLength(fullText: string, position: number): number {
  if (fullText.slice(position, position + 2) === "\r\n") return 2;
  if (fullText[position] === "\n") return 1;
  return 0;
}

function rewriteBarrelDeclaration(
  declaration: ImportDeclaration,
  converted: Set<string>,
  fullText: string,
  barrel: string,
): Edit | null {
  const namedImports = declaration.getNamedImports();
  const kept = namedImports.filter(
    (named) => !converted.has(named.getNameNode().getText()),
  );
  const defaultImport = declaration.getDefaultImport();
  const namespaceImport = declaration.getNamespaceImport();

  if (kept.length === namedImports.length) return null;

  if (kept.length === 0 && !defaultImport && !namespaceImport) {
    const start = declaration.getStart();
    const end = declaration.getEnd() + trailingNewlineLength(fullText, declaration.getEnd());
    return { start, end, replacement: "" };
  }

  const typeOnly = declaration.isTypeOnly() ? "type " : "";
  const defaultText = defaultImport ? defaultImport.getText() : "";
  const namedText = kept.map((named) => named.getText()).join(", ");
  const prefix = defaultText ? `${defaultText}, ` : "";
  const replacement = `import ${typeOnly}${prefix}{ ${namedText} } from "${barrel}";`;
  return { start: declaration.getStart(), end: declaration.getEnd(), replacement };
}

// Trim the converted names from a local re-export-barrel import declaration,
// mapping each imported name to its canonical via the barrel's export map.
function rewriteLocalBarrelDeclaration(
  declaration: ImportDeclaration,
  converted: Set<string>,
  fullText: string,
  exports: Map<string, string>,
): Edit | null {
  const namedImports = declaration.getNamedImports();
  if (!namedImports.length) return null;
  const kept = namedImports.filter((named) => {
    const canonical = canonicalFromBarrel(exports, named.getNameNode().getText());
    return !(canonical && converted.has(canonical));
  });
  if (kept.length === namedImports.length) return null;

  const defaultImport = declaration.getDefaultImport();
  const namespaceImport = declaration.getNamespaceImport();
  if (kept.length === 0 && !defaultImport && !namespaceImport) {
    const start = declaration.getStart();
    const end = declaration.getEnd() + trailingNewlineLength(fullText, declaration.getEnd());
    return { start, end, replacement: "" };
  }
  const typeOnly = declaration.isTypeOnly() ? "type " : "";
  const defaultText = defaultImport ? defaultImport.getText() : "";
  const namedText = kept.map((named) => named.getText()).join(", ");
  const prefix = defaultText ? `${defaultText}, ` : "";
  return {
    start: declaration.getStart(),
    end: declaration.getEnd(),
    replacement: `import ${typeOnly}${prefix}{ ${namedText} } from "${declaration.getModuleSpecifierValue()}";`,
  };
}

export function buildImportEdits(
  sourceFile: SourceFile,
  converted: Set<string>,
  fullText: string,
  barrelMap?: BarrelMap,
): Edit[] {
  const edits: Edit[] = [];
  const fromPath = barrelMap && barrelMap.size ? sourceFile.getFilePath() : "";
  for (const declaration of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = declaration.getModuleSpecifierValue();
    const matched = matchBarrel(moduleSpecifier);
    if (!matched) {
      if (!barrelMap || !barrelMap.size) continue;
      const barrelPath = resolveBarrelPath(fromPath, moduleSpecifier, barrelMap);
      if (!barrelPath) continue;
      const edit = rewriteLocalBarrelDeclaration(declaration, converted, fullText, barrelMap.get(barrelPath)!);
      if (edit) edits.push(edit);
      continue;
    }
    if (!matched.deep) {
      const edit = rewriteBarrelDeclaration(declaration, converted, fullText, matched.barrel);
      if (edit) edits.push(edit);
    } else {
      const segment = moduleSpecifier.slice(matched.barrel.length + 1);
      const canonicalName = segment.split("/")[0] ?? "";
      if (canonicalName && converted.has(canonicalName)) {
        const start = declaration.getStart();
        const end = declaration.getEnd() + trailingNewlineLength(fullText, declaration.getEnd());
        edits.push({ start, end, replacement: "" });
      }
    }
  }
  return edits;
}

export function buildImportBlock(requests: ImportRequest[]): string {
  const grouped = new Map<string, Set<string>>();
  for (const request of requests) {
    const existing = grouped.get(request.moduleSpecifier) ?? new Set<string>();
    for (const name of request.names) existing.add(name);
    grouped.set(request.moduleSpecifier, existing);
  }
  const lines = [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([moduleSpecifier, names]) => {
      const sortedNames = [...names].sort((a, b) => a.localeCompare(b));
      return `import { ${sortedNames.join(", ")} } from "${moduleSpecifier}";`;
    });
  return lines.join("\n");
}

export function insertImportBlock(text: string, block: string): string {
  if (!block) return text;
  const lines = text.split("\n");
  const firstImportIndex = lines.findIndex((line) => /^\s*import\b/.test(line));
  if (firstImportIndex >= 0) {
    lines.splice(firstImportIndex, 0, block);
    return lines.join("\n");
  }
  const directive = text.match(/^\s*(["'])use (client|server|strict)\1\s*;?[^\n]*\n/);
  if (directive) {
    const offset = directive[0].length;
    return text.slice(0, offset) + block + "\n" + text.slice(offset);
  }
  return block + "\n" + text;
}
