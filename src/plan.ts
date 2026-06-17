import { Node, SyntaxKind } from "ts-morph";
import type { SourceFile } from "ts-morph";
import type {
  AttributeValue,
  CompositeContext,
  ComponentMapping,
  ContainerContext,
  GeneratedAttribute,
  ImportRequest,
  JsxElementLike,
  ParsedAttribute,
  ParsedElement,
  Registry,
} from "./types.js";
import type { Edit } from "./edits.js";
import { getOpeningElement, parseElement } from "./attributes.js";
import { renderAttribute } from "./render.js";
import { collectMuiBindings } from "./imports.js";
import { descendantJsxElements, getTagName, indentOf } from "./nodes.js";
import { INFRA_SKIP } from "./infra.js";

export interface ManualHit {
  component: string;
  line: number;
  message: string;
}

export interface PlanResult {
  edits: Edit[];
  imports: ImportRequest[];
  warnings: string[];
  convertedCanonical: Set<string>;
  manual: ManualHit[];
}

function stringValue(mapped: string): AttributeValue {
  return { kind: "string", value: mapped };
}

function collectJsxNodes(sourceFile: SourceFile): JsxElementLike[] {
  return [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ];
}

function renderClassName(
  existing: ParsedAttribute | undefined,
  classNames: string[],
  registerImport: (request: ImportRequest) => void,
): string | null {
  const cleaned = classNames.filter(Boolean);
  if (!existing) {
    return cleaned.length ? `className="${cleaned.join(" ")}"` : null;
  }
  if (existing.value.kind === "string") {
    const merged = [existing.value.value, ...cleaned].filter(Boolean).join(" ");
    return merged ? `className="${merged}"` : null;
  }
  if (existing.value.kind === "expression") {
    if (cleaned.length) {
      registerImport({ names: ["cn"], moduleSpecifier: "@/lib/utils" });
      return `className={cn("${cleaned.join(" ")}", ${existing.value.expression})}`;
    }
    return `className={${existing.value.expression}}`;
  }
  return cleaned.length ? `className="${cleaned.join(" ")}"` : null;
}

function reindent(replacement: string, fullText: string, start: number): string {
  const indent = indentOf(fullText, start);
  if (!indent) return replacement;
  return replacement
    .split("\n")
    .map((line, index) => (index === 0 || line.length === 0 ? line : indent + line))
    .join("\n");
}

function emitInPlace(
  node: JsxElementLike,
  element: ParsedElement,
  mapping: ComponentMapping,
  registerImport: (request: ImportRequest) => void,
  warn: (message: string) => void,
): Edit[] {
  const opening = getOpeningElement(node);
  const target = mapping.target ?? element.tagName;

  const classNameAttribute = element.attributes.find((attribute) => attribute.name === "className");
  const rest = element.attributes.filter((attribute) => attribute.name !== "className");

  const classNames: string[] = [];
  if (mapping.defaultClassName) classNames.push(mapping.defaultClassName);
  let generated: GeneratedAttribute[] = [];

  if (mapping.resolve) {
    const result = mapping.resolve(rest, {
      warn,
      findAttribute: (name) => element.attributes.find((attribute) => attribute.name === name),
    });
    generated = result.attributes;
    classNames.push(...result.classNames);
  } else {
    for (const attribute of rest) {
      const rule = mapping.props?.[attribute.name];
      if (!rule) {
        if (attribute.name === "sx") warn("sx retained; run the sx conversion step");
        generated.push({ name: attribute.name, value: attribute.value });
        continue;
      }
      if (rule.warning) warn(rule.warning);
      if (rule.drop) continue;
      if (rule.toClassName) {
        const className = rule.toClassName(attribute.value);
        if (className) classNames.push(className);
        continue;
      }
      if (rule.valueMap && attribute.value.kind === "string") {
        const mapped = rule.valueMap[attribute.value.value];
        if (mapped === null) continue;
        const name = rule.rename ?? attribute.name;
        const value = mapped === undefined ? attribute.value : stringValue(mapped);
        generated.push({ name, value });
        continue;
      }
      const name = rule.rename ?? attribute.name;
      generated.push({ name, value: attribute.value });
    }
  }

  if (mapping.warnIfChildren && element.hasChildren) warn(mapping.warnIfChildren);
  if (mapping.notes) warn(mapping.notes);
  if (element.spreads.length) {
    warn("spread props moved to the end of the element; check order and precedence");
  }

  if (mapping.importPath && mapping.target) {
    registerImport({ names: [mapping.target], moduleSpecifier: mapping.importPath });
  }
  for (const extra of mapping.extraImports ?? []) registerImport(extra);

  const classNameText = renderClassName(classNameAttribute, classNames, registerImport);

  const parts: string[] = [];
  for (const attribute of generated) parts.push(renderAttribute(attribute));
  if (classNameText) parts.push(classNameText);
  for (const spread of element.spreads) parts.push(spread.text);
  const attributeText = parts.length ? " " + parts.join(" ") : "";
  const openingText = `<${target}${attributeText}${element.selfClosing ? " />" : ">"}`;

  const edits: Edit[] = [
    { start: opening.getStart(), end: opening.getEnd(), replacement: openingText },
  ];
  if (!element.selfClosing && Node.isJsxElement(node)) {
    const closing = node.getClosingElement();
    edits.push({ start: closing.getStart(), end: closing.getEnd(), replacement: `</${target}>` });
  }
  return edits;
}

export interface PlanOptions {
  base?: "radix" | "base";
}

export function planFile(
  sourceFile: SourceFile,
  fullText: string,
  registry: Registry,
  options: PlanOptions = {},
): PlanResult {
  const base = options.base ?? "radix";
  const bindings = collectMuiBindings(sourceFile);
  const localToCanonical = new Map<string, string>();
  for (const binding of bindings) localToCanonical.set(binding.localName, binding.canonicalName);

  const nodes = collectJsxNodes(sourceFile);

  const edits: Edit[] = [];
  const imports: ImportRequest[] = [];
  const warnings: string[] = [];
  const convertedCanonical = new Set<string>();
  const manual: ManualHit[] = [];
  const consumed = new Set<number>();

  const registerImport = (request: ImportRequest) => {
    imports.push(request);
  };
  const markConverted = (canonical: string) => {
    convertedCanonical.add(canonical);
  };

  for (const node of nodes) {
    const startPosition = node.getStart();
    if (consumed.has(startPosition)) continue;

    const localTag = getTagName(node);
    const canonical = localToCanonical.get(localTag);
    if (!canonical) continue;
    if (INFRA_SKIP.has(canonical)) continue;

    const line = node.getStartLineNumber();
    const warn = (message: string) => warnings.push(`line ${line} <${localTag}>: ${message}`);

    const mapping = registry[canonical];
    if (!mapping) {
      warnings.push(`line ${line} <${localTag}>: not in the registry; left unchanged`);
      manual.push({ component: canonical, line, message: "not in the registry; review manually" });
      continue;
    }
    if (mapping.manual) {
      warnings.push(`line ${line} <${localTag}>: ${mapping.manual}`);
      manual.push({ component: canonical, line, message: mapping.manual });
      continue;
    }

    const element = parseElement(node, fullText);

    if (mapping.containerTransform) {
      const context: ContainerContext = {
        node,
        element,
        fullText,
        indent: indentOf(fullText, startPosition),
        base,
        localToCanonical,
        registry,
        registerImport,
        warn,
        consume: (child) => consumed.add(child.getStart()),
        markConverted,
      };
      edits.push(...mapping.containerTransform(context));
      convertedCanonical.add(canonical);
      continue;
    }

    if (mapping.transform) {
      const context: CompositeContext = { element, registerImport, warn };
      const replacement = reindent(mapping.transform(context), fullText, startPosition);
      edits.push({ start: element.start, end: element.end, replacement });
      convertedCanonical.add(canonical);
      for (const descendant of descendantJsxElements(node)) {
        consumed.add(descendant.getStart());
        const childCanonical = localToCanonical.get(getTagName(descendant));
        if (!childCanonical) continue;
        const childMapping = registry[childCanonical];
        if (childMapping && !childMapping.manual) {
          const childLine = descendant.getStartLineNumber();
          warnings.push(
            `line ${childLine}: nested <${getTagName(descendant)}> inside the block-converted <${localTag}> was not adjusted; migrate manually`,
          );
        }
      }
      continue;
    }

    edits.push(...emitInPlace(node, element, mapping, registerImport, warn));
    convertedCanonical.add(canonical);
  }

  return { edits, imports, warnings, convertedCanonical, manual };
}
