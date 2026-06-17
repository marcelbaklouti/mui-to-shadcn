import { Node, SyntaxKind } from "ts-morph";
import type {
  ImportDeclaration,
  JsxAttribute,
  JsxOpeningElement,
  JsxSelfClosingElement,
  SourceFile,
} from "ts-morph";
import type { Edit } from "./edits.js";
import { applyEdits, resolveOverlaps } from "./edits.js";
import { insertImportBlock } from "./imports.js";
import { lucideForMuiIcon } from "./icon-map.js";

const ICONS_BARREL = "@mui/icons-material";

export interface IconResult {
  text: string;
  warnings: string[];
  needsCn: boolean;
  used: boolean;
}

interface IconBinding {
  localName: string;
  muiName: string;
  lucide: string | null;
}

const iconColorClass: Record<string, string> = {
  primary: "text-primary",
  secondary: "text-secondary-foreground",
  error: "text-destructive",
  success: "text-green-600",
  warning: "text-amber-500",
  info: "text-sky-500",
  disabled: "text-muted-foreground",
  action: "text-foreground",
};

const fontSizeClass: Record<string, string> = {
  small: "size-4",
  large: "size-8",
  inherit: "size-[1em]",
};

function trailingNewlineLength(fullText: string, position: number): number {
  if (fullText.slice(position, position + 2) === "\r\n") return 2;
  if (fullText[position] === "\n") return 1;
  return 0;
}

function deepIconName(moduleSpecifier: string): string | null {
  if (!moduleSpecifier.startsWith(ICONS_BARREL + "/")) return null;
  const segment = moduleSpecifier.slice(ICONS_BARREL.length + 1).replace(/^esm\//, "");
  const name = segment.split("/").pop() ?? "";
  return name || null;
}

function collectIconBindings(sourceFile: SourceFile): IconBinding[] {
  const bindings: IconBinding[] = [];
  for (const declaration of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = declaration.getModuleSpecifierValue();
    if (moduleSpecifier === ICONS_BARREL) {
      for (const named of declaration.getNamedImports()) {
        const muiName = named.getNameNode().getText();
        const alias = named.getAliasNode();
        bindings.push({
          localName: alias ? alias.getText() : muiName,
          muiName,
          lucide: lucideForMuiIcon(muiName) ?? null,
        });
      }
      continue;
    }
    const deep = deepIconName(moduleSpecifier);
    if (!deep) continue;
    const defaultImport = declaration.getDefaultImport();
    if (defaultImport) {
      bindings.push({ localName: defaultImport.getText(), muiName: deep, lucide: lucideForMuiIcon(deep) ?? null });
    }
    for (const named of declaration.getNamedImports()) {
      const muiName = named.getNameNode().getText();
      const alias = named.getAliasNode();
      bindings.push({
        localName: alias ? alias.getText() : muiName,
        muiName,
        lucide: lucideForMuiIcon(muiName) ?? null,
      });
    }
  }
  return bindings;
}

// True if the local name is referenced anywhere other than as a JSX tag or in an import.
function hasNonTagReference(sourceFile: SourceFile, localName: string): boolean {
  for (const id of sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (id.getText() !== localName) continue;
    if (id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)) continue;
    const parent = id.getParent();
    const kind = parent?.getKind();
    if (
      kind === SyntaxKind.JsxOpeningElement ||
      kind === SyntaxKind.JsxSelfClosingElement ||
      kind === SyntaxKind.JsxClosingElement
    ) {
      continue;
    }
    return true;
  }
  return false;
}

function stringValueOf(attribute: JsxAttribute): string | undefined {
  const initializer = attribute.getInitializer();
  if (!initializer) return undefined;
  if (Node.isStringLiteral(initializer)) return initializer.getLiteralValue();
  if (Node.isJsxExpression(initializer)) {
    const expression = initializer.getExpression();
    if (expression && Node.isStringLiteral(expression)) return expression.getLiteralValue();
  }
  return undefined;
}

function expressionTextOf(attribute: JsxAttribute): string | null {
  const initializer = attribute.getInitializer();
  if (initializer && Node.isJsxExpression(initializer)) {
    const expression = initializer.getExpression();
    return expression ? expression.getText() : null;
  }
  if (initializer && Node.isStringLiteral(initializer)) return null;
  return null;
}

interface OpeningBuild {
  text: string;
  needsCn: boolean;
}

function buildIconOpening(
  node: JsxOpeningElement | JsxSelfClosingElement,
  lucide: string,
  selfClosing: boolean,
): OpeningBuild {
  const classes: string[] = [];
  const parts: string[] = [];
  let existingClassName: string | null = null;
  let existingClassExpression: string | null = null;

  for (const attribute of node.getAttributes()) {
    if (Node.isJsxSpreadAttribute(attribute)) {
      parts.push(attribute.getText());
      continue;
    }
    const name = attribute.getNameNode().getText();
    const stringValue = stringValueOf(attribute);

    if (name === "className") {
      const initializer = attribute.getInitializer();
      if (initializer && Node.isStringLiteral(initializer)) existingClassName = initializer.getLiteralValue();
      else existingClassExpression = expressionTextOf(attribute);
      continue;
    }
    if (name === "fontSize") {
      if (stringValue && fontSizeClass[stringValue]) classes.push(fontSizeClass[stringValue]!);
      continue;
    }
    if (name === "color") {
      if (stringValue === "inherit") continue;
      if (stringValue && iconColorClass[stringValue]) {
        classes.push(iconColorClass[stringValue]!);
        continue;
      }
      parts.push(attribute.getText());
      continue;
    }
    if (name === "titleAccess") {
      if (stringValue !== undefined) parts.push(`aria-label="${stringValue}"`);
      else {
        const expression = expressionTextOf(attribute);
        if (expression) parts.push(`aria-label={${expression}}`);
      }
      continue;
    }
    if (name === "htmlColor") {
      const expression = expressionTextOf(attribute);
      if (stringValue !== undefined) parts.push(`color="${stringValue}"`);
      else if (expression) parts.push(`color={${expression}}`);
      continue;
    }
    parts.push(attribute.getText());
  }

  let needsCn = false;
  let classNamePart: string | null = null;
  if (existingClassExpression !== null) {
    if (classes.length) {
      classNamePart = `className={cn("${classes.join(" ")}", ${existingClassExpression})}`;
      needsCn = true;
    } else {
      classNamePart = `className={${existingClassExpression}}`;
    }
  } else {
    const merged = [existingClassName ?? "", ...classes].filter(Boolean).join(" ");
    if (merged) classNamePart = `className="${merged}"`;
  }
  if (classNamePart) parts.push(classNamePart);

  const attributeText = parts.length ? " " + parts.join(" ") : "";
  return { text: `<${lucide}${attributeText}${selfClosing ? " />" : ">"}`, needsCn };
}

function buildLucideImportEdits(
  sourceFile: SourceFile,
  fullText: string,
  newSpecifiers: string[],
): { edits: Edit[]; insertLine: string | null } {
  if (!newSpecifiers.length) return { edits: [], insertLine: null };
  let existing: ImportDeclaration | undefined;
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() === "lucide-react") {
      existing = declaration;
      break;
    }
  }

  if (existing && !existing.getDefaultImport() && !existing.getNamespaceImport()) {
    const current = existing.getNamedImports().map((named) => named.getText());
    const merged = [...new Set([...current, ...newSpecifiers])].sort((a, b) => a.localeCompare(b));
    const replacement = `import { ${merged.join(", ")} } from "lucide-react";`;
    return { edits: [{ start: existing.getStart(), end: existing.getEnd(), replacement }], insertLine: null };
  }

  const sorted = [...new Set(newSpecifiers)].sort((a, b) => a.localeCompare(b));
  return { edits: [], insertLine: `import { ${sorted.join(", ")} } from "lucide-react";` };
}

export function iconsFile(sourceFile: SourceFile, fullText: string): IconResult {
  const bindings = collectIconBindings(sourceFile);
  if (!bindings.length) return { text: fullText, warnings: [], needsCn: false, used: false };

  const warnings: string[] = [];
  const edits: Edit[] = [];
  const lucideSpecifiers: string[] = [];
  // localName -> { lucide, rename } for converted bindings
  const renameTargets = new Map<string, string>();
  const convertedLocals = new Set<string>();
  let needsCn = false;

  for (const binding of bindings) {
    if (!binding.lucide) {
      warnings.push(
        `<${binding.localName}>: @mui/icons-material/${binding.muiName} has no known lucide-react mapping; left as-is — pick one at https://lucide.dev/icons`,
      );
      continue;
    }
    convertedLocals.add(binding.localName);
    const aliasMode = hasNonTagReference(sourceFile, binding.localName);
    if (aliasMode) {
      lucideSpecifiers.push(
        binding.lucide === binding.localName ? binding.lucide : `${binding.lucide} as ${binding.localName}`,
      );
    } else {
      renameTargets.set(binding.localName, binding.lucide);
      lucideSpecifiers.push(binding.lucide);
    }
  }

  if (!convertedLocals.size) {
    return { text: fullText, warnings, needsCn: false, used: false };
  }

  // Rewrite JSX tag usages for rename-mode icons.
  const openings: (JsxOpeningElement | JsxSelfClosingElement)[] = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ];
  for (const node of openings) {
    const tag = node.getTagNameNode().getText();
    const lucide = renameTargets.get(tag);
    if (!lucide) continue;
    const selfClosing = Node.isJsxSelfClosingElement(node);
    const built = buildIconOpening(node, lucide, selfClosing);
    if (built.needsCn) needsCn = true;
    edits.push({ start: node.getStart(), end: node.getEnd(), replacement: built.text });
    if (!selfClosing) {
      const parent = node.getParent();
      if (parent && Node.isJsxElement(parent)) {
        const closing = parent.getClosingElement();
        edits.push({ start: closing.getStart(), end: closing.getEnd(), replacement: `</${lucide}>` });
      }
    }
  }

  // Remove (or trim) @mui/icons-material imports for converted icons.
  for (const declaration of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = declaration.getModuleSpecifierValue();
    const isBarrel = moduleSpecifier === ICONS_BARREL;
    const deep = deepIconName(moduleSpecifier);
    if (!isBarrel && !deep) continue;

    if (deep && declaration.getDefaultImport()) {
      const local = declaration.getDefaultImport()!.getText();
      if (convertedLocals.has(local) && declaration.getNamedImports().length === 0) {
        const end = declaration.getEnd() + trailingNewlineLength(fullText, declaration.getEnd());
        edits.push({ start: declaration.getStart(), end, replacement: "" });
        continue;
      }
    }

    const named = declaration.getNamedImports();
    if (named.length) {
      const kept = named.filter((entry) => {
        const local = entry.getAliasNode()?.getText() ?? entry.getNameNode().getText();
        return !convertedLocals.has(local);
      });
      if (kept.length === named.length) continue;
      const defaultImport = declaration.getDefaultImport();
      const defaultConverted = defaultImport ? convertedLocals.has(defaultImport.getText()) : false;
      if (kept.length === 0 && (!defaultImport || defaultConverted)) {
        const end = declaration.getEnd() + trailingNewlineLength(fullText, declaration.getEnd());
        edits.push({ start: declaration.getStart(), end, replacement: "" });
      } else {
        const keptText = kept.map((entry) => entry.getText()).join(", ");
        const prefix = defaultImport && !defaultConverted ? `${defaultImport.getText()}, ` : "";
        edits.push({
          start: declaration.getStart(),
          end: declaration.getEnd(),
          replacement: `import ${prefix}{ ${keptText} } from "${moduleSpecifier}";`,
        });
      }
    }
  }

  const lucideImport = buildLucideImportEdits(sourceFile, fullText, lucideSpecifiers);
  edits.push(...lucideImport.edits);

  const { edits: resolved } = resolveOverlaps(edits);
  let text = applyEdits(fullText, resolved);
  if (lucideImport.insertLine) text = insertImportBlock(text, lucideImport.insertLine);

  return { text, warnings, needsCn, used: true };
}
