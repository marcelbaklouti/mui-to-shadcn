import { Node, SyntaxKind } from "ts-morph";
import type { SourceFile } from "ts-morph";
import type { Edit } from "./edits.js";
import { applyEdits, resolveOverlaps } from "./edits.js";

// Provider wrappers: keep the children, drop the wrapper and its props.
const UNWRAP = new Set([
  "ThemeProvider",
  "StyledEngineProvider",
  "CssVarsProvider",
  "Experimental_CssVarsProvider",
  "CacheProvider",
  "AppRouterCacheProvider",
  "ScopedCssBaseline",
]);

// Elements to remove entirely (Tailwind preflight replaces the baseline reset).
const REMOVE = new Set(["CssBaseline", "GlobalStyles", "Global"]);

// Theme/styling utilities that cannot be auto-converted (arbitrary CSS / runtime theme).
const WARN_UTILS = new Set([
  "createTheme",
  "responsiveFontSizes",
  "extendTheme",
  "useTheme",
  "useColorScheme",
  "alpha",
  "darken",
  "lighten",
  "emphasize",
  "styled",
  "keyframes",
  "makeStyles",
  "withStyles",
  "createStyles",
  "createCache",
]);

// Canonical names the component pass should ignore (handled here instead).
export const INFRA_SKIP = new Set([...UNWRAP, ...REMOVE]);

const INFRA_SOURCES = new Set([
  "@mui/material",
  "@mui/material/styles",
  "@mui/system",
  "@mui/styled-engine",
  "@emotion/react",
  "@emotion/styled",
  "@emotion/cache",
  "@mui/styles",
]);

function isInfraSource(specifier: string): boolean {
  return INFRA_SOURCES.has(specifier) || specifier.startsWith("@mui/material-nextjs");
}

function trailingNewlineLength(fullText: string, position: number): number {
  if (fullText.slice(position, position + 2) === "\r\n") return 2;
  if (fullText[position] === "\n") return 1;
  return 0;
}

export interface InfraResult {
  text: string;
  warnings: string[];
}

export function infraFile(sourceFile: SourceFile, fullText: string): InfraResult {
  const unwrapLocals = new Set<string>();
  const removeLocals = new Map<string, string>();
  const utils = new Set<string>();

  for (const declaration of sourceFile.getImportDeclarations()) {
    if (!isInfraSource(declaration.getModuleSpecifierValue())) continue;
    for (const named of declaration.getNamedImports()) {
      const name = named.getNameNode().getText();
      const local = named.getAliasNode()?.getText() ?? name;
      if (UNWRAP.has(name)) unwrapLocals.add(local);
      else if (REMOVE.has(name)) removeLocals.set(local, name);
      else if (WARN_UTILS.has(name)) utils.add(name);
    }
  }

  if (!unwrapLocals.size && !removeLocals.size && !utils.size) {
    return { text: fullText, warnings: [] };
  }

  const edits: Edit[] = [];
  const warnings: string[] = [];
  const warned = new Set<string>();

  const elements = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ];

  for (const node of elements) {
    const tag = Node.isJsxElement(node)
      ? node.getOpeningElement().getTagNameNode().getText()
      : node.getTagNameNode().getText();

    if (unwrapLocals.has(tag)) {
      if (Node.isJsxElement(node)) {
        const open = node.getOpeningElement();
        const close = node.getClosingElement();
        edits.push({ start: open.getStart(), end: open.getEnd(), replacement: "" });
        edits.push({ start: close.getStart(), end: close.getEnd(), replacement: "" });
      } else {
        edits.push({ start: node.getStart(), end: node.getEnd(), replacement: "" });
      }
      if ((tag.includes("Theme") || tag.includes("CssVars")) && !warned.has("theme")) {
        warned.add("theme");
        warnings.push(
          "theme provider removed; port any custom theme tokens (palette/typography/spacing) to your Tailwind/shadcn theme",
        );
      }
      continue;
    }

    const removed = removeLocals.get(tag);
    if (removed) {
      edits.push({ start: node.getStart(), end: node.getEnd(), replacement: "" });
      if ((removed === "GlobalStyles" || removed === "Global") && !warned.has("global")) {
        warned.add("global");
        warnings.push("global styles removed; port them to your CSS/Tailwind layer manually");
      }
    }
  }

  // Trim or drop the infra imports we handled (leave the warn-utils imports in place).
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (!isInfraSource(declaration.getModuleSpecifierValue())) continue;
    const moduleSpecifier = declaration.getModuleSpecifierValue();
    const named = declaration.getNamedImports();
    if (!named.length) continue;
    const kept = named.filter((entry) => {
      const name = entry.getNameNode().getText();
      return !UNWRAP.has(name) && !REMOVE.has(name);
    });
    if (kept.length === named.length) continue;
    const defaultImport = declaration.getDefaultImport();
    if (kept.length === 0 && !defaultImport) {
      const end = declaration.getEnd() + trailingNewlineLength(fullText, declaration.getEnd());
      edits.push({ start: declaration.getStart(), end, replacement: "" });
    } else {
      const typeOnly = declaration.isTypeOnly() ? "type " : "";
      const prefix = defaultImport ? `${defaultImport.getText()}, ` : "";
      const keptText = kept.map((entry) => entry.getText()).join(", ");
      edits.push({
        start: declaration.getStart(),
        end: declaration.getEnd(),
        replacement: `import ${typeOnly}${prefix}{ ${keptText} } from "${moduleSpecifier}";`,
      });
    }
  }

  if (utils.size) {
    warnings.push(
      `MUI styling utilities still present (${[...utils].sort().join(", ")}); these wrap arbitrary CSS/theme and were left in place — port them manually and remove the @mui/@emotion dependencies`,
    );
  }

  const { edits: resolved } = resolveOverlaps(edits);
  const text = applyEdits(fullText, resolved);
  return { text, warnings };
}
