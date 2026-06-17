import type { ImportDeclaration, SourceFile } from "ts-morph";
import type { Edit } from "./edits.js";
import type { ImportRequest } from "./types.js";

const MUI_BARRELS = ["@mui/material", "@mui/lab"];

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

export function collectMuiBindings(sourceFile: SourceFile): MuiBinding[] {
  const bindings: MuiBinding[] = [];
  for (const declaration of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = declaration.getModuleSpecifierValue();
    const matched = matchBarrel(moduleSpecifier);
    if (!matched) continue;
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

export function buildImportEdits(
  sourceFile: SourceFile,
  converted: Set<string>,
  fullText: string,
): Edit[] {
  const edits: Edit[] = [];
  for (const declaration of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = declaration.getModuleSpecifierValue();
    const matched = matchBarrel(moduleSpecifier);
    if (!matched) continue;
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
