import type { JsxElement, JsxSelfClosingElement } from "ts-morph";
import type { Edit } from "./edits.js";

export type JsxElementLike = JsxElement | JsxSelfClosingElement;
export type ContainerEdit = Edit;

export type AttributeValue =
  | { kind: "string"; value: string }
  | { kind: "expression"; expression: string }
  | { kind: "boolean" };

export interface ParsedAttribute {
  name: string;
  value: AttributeValue;
  start: number;
  end: number;
}

export interface ParsedSpread {
  text: string;
  start: number;
  end: number;
}

export interface ParsedElement {
  tagName: string;
  attributes: ParsedAttribute[];
  spreads: ParsedSpread[];
  innerText: string;
  selfClosing: boolean;
  hasChildren: boolean;
  start: number;
  end: number;
}

export interface GeneratedAttribute {
  name: string;
  value: AttributeValue;
}

export interface ImportRequest {
  names: string[];
  moduleSpecifier: string;
}

export type PropValueMap = Record<string, string | null>;

export interface PropRule {
  rename?: string;
  valueMap?: PropValueMap;
  toClassName?: (value: AttributeValue) => string | null;
  drop?: boolean;
  warning?: string;
}

export interface ResolverHelpers {
  warn: (message: string) => void;
  findAttribute: (name: string) => ParsedAttribute | undefined;
}

export interface ResolverResult {
  attributes: GeneratedAttribute[];
  classNames: string[];
}

export type InPlaceResolver = (
  attributes: ParsedAttribute[],
  helpers: ResolverHelpers,
) => ResolverResult;

export interface CompositeContext {
  element: ParsedElement;
  registerImport: (request: ImportRequest) => void;
  warn: (message: string) => void;
}

export type CompositeTransform = (context: CompositeContext) => string;

export interface ContainerContext {
  node: JsxElementLike;
  element: ParsedElement;
  fullText: string;
  indent: string;
  base: "radix" | "base";
  localToCanonical: Map<string, string>;
  registry: Registry;
  registerImport: (request: ImportRequest) => void;
  warn: (message: string) => void;
  consume: (node: JsxElementLike) => void;
  markConverted: (canonical: string) => void;
}

export type ContainerTransform = (context: ContainerContext) => ContainerEdit[];

export interface ComponentMapping {
  target?: string;
  importPath?: string;
  defaultClassName?: string;
  props?: Record<string, PropRule>;
  resolve?: InPlaceResolver;
  transform?: CompositeTransform;
  containerTransform?: ContainerTransform;
  extraImports?: ImportRequest[];
  warnIfChildren?: string;
  notes?: string;
  manual?: string;
}

export type Registry = Record<string, ComponentMapping>;
