import { Node, SyntaxKind } from "ts-morph";
import type {
  Expression,
  JsxAttribute,
  JsxOpeningElement,
  JsxSelfClosingElement,
  ObjectLiteralExpression,
  SourceFile,
} from "ts-morph";
import type { Edit } from "./edits.js";
import { applyEdits, resolveOverlaps } from "./edits.js";
import { buildImportEdits, collectMuiBindings } from "./imports.js";

export interface SxResult {
  text: string;
  warnings: string[];
  needsCn: boolean;
}

const breakpointPrefix: Record<string, string> = {
  xs: "",
  sm: "sm:",
  md: "md:",
  lg: "lg:",
  xl: "xl:",
};

const layoutComponents = new Set(["Box", "Stack", "Grid", "Grid2", "GridLegacy", "Container"]);

const spacingPrefix: Record<string, string> = {
  m: "m",
  mt: "mt",
  mr: "mr",
  mb: "mb",
  ml: "ml",
  mx: "mx",
  my: "my",
  margin: "m",
  marginTop: "mt",
  marginRight: "mr",
  marginBottom: "mb",
  marginLeft: "ml",
  marginX: "mx",
  marginY: "my",
  p: "p",
  pt: "pt",
  pr: "pr",
  pb: "pb",
  pl: "pl",
  px: "px",
  py: "py",
  padding: "p",
  paddingTop: "pt",
  paddingRight: "pr",
  paddingBottom: "pb",
  paddingLeft: "pl",
  paddingX: "px",
  paddingY: "py",
  gap: "gap",
  rowGap: "gap-y",
  columnGap: "gap-x",
};

const sizingPrefix: Record<string, string> = {
  width: "w",
  height: "h",
  minWidth: "min-w",
  maxWidth: "max-w",
  minHeight: "min-h",
  maxHeight: "max-h",
  top: "top",
  right: "right",
  bottom: "bottom",
  left: "left",
};

const displayMap: Record<string, string> = {
  flex: "flex",
  block: "block",
  inline: "inline",
  "inline-block": "inline-block",
  "inline-flex": "inline-flex",
  grid: "grid",
  none: "hidden",
};

const flexDirectionMap: Record<string, string> = {
  row: "flex-row",
  column: "flex-col",
  "row-reverse": "flex-row-reverse",
  "column-reverse": "flex-col-reverse",
};

const alignItemsMap: Record<string, string> = {
  center: "items-center",
  "flex-start": "items-start",
  "flex-end": "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
};

const justifyContentMap: Record<string, string> = {
  center: "justify-center",
  "flex-start": "justify-start",
  "flex-end": "justify-end",
  "space-between": "justify-between",
  "space-around": "justify-around",
  "space-evenly": "justify-evenly",
};

const positionMap: Record<string, string> = {
  static: "static",
  relative: "relative",
  absolute: "absolute",
  fixed: "fixed",
  sticky: "sticky",
};

const textAlignMap: Record<string, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
  justify: "text-justify",
};

const colorTokenMap: Record<string, string> = {
  primary: "primary",
  "primary.main": "primary",
  secondary: "secondary",
  "secondary.main": "secondary",
  error: "destructive",
  "error.main": "destructive",
  "text.primary": "foreground",
  "text.secondary": "muted-foreground",
  "text.disabled": "muted-foreground",
  "background.paper": "card",
  "background.default": "background",
  divider: "border",
  success: "green-600",
  "success.main": "green-600",
  warning: "amber-500",
  "warning.main": "amber-500",
  info: "sky-500",
  "info.main": "sky-500",
  "common.white": "white",
  "common.black": "black",
  "grey.50": "gray-50",
  "grey.100": "gray-100",
  "grey.200": "gray-200",
  "grey.300": "gray-300",
  "grey.400": "gray-400",
  "grey.500": "gray-500",
  "grey.600": "gray-600",
  "grey.700": "gray-700",
  "grey.800": "gray-800",
  "grey.900": "gray-900",
};

const textTransformMap: Record<string, string> = {
  uppercase: "uppercase",
  lowercase: "lowercase",
  capitalize: "capitalize",
  none: "normal-case",
};

const objectFitMap: Record<string, string> = {
  contain: "object-contain",
  cover: "object-cover",
  fill: "object-fill",
  none: "object-none",
  "scale-down": "object-scale-down",
};

const visibilityMap: Record<string, string> = {
  visible: "visible",
  hidden: "invisible",
  collapse: "collapse",
};

const userSelectMap: Record<string, string> = {
  none: "select-none",
  text: "select-text",
  all: "select-all",
  auto: "select-auto",
};

const alignSelfMap: Record<string, string> = {
  auto: "self-auto",
  "flex-start": "self-start",
  "flex-end": "self-end",
  center: "self-center",
  stretch: "self-stretch",
  baseline: "self-baseline",
};

const justifySelfMap: Record<string, string> = {
  auto: "justify-self-auto",
  start: "justify-self-start",
  end: "justify-self-end",
  center: "justify-self-center",
  stretch: "justify-self-stretch",
};

const justifyItemsMap: Record<string, string> = {
  start: "justify-items-start",
  end: "justify-items-end",
  center: "justify-items-center",
  stretch: "justify-items-stretch",
};

const verticalAlignMap: Record<string, string> = {
  baseline: "align-baseline",
  top: "align-top",
  middle: "align-middle",
  bottom: "align-bottom",
  "text-top": "align-text-top",
  "text-bottom": "align-text-bottom",
  sub: "align-sub",
  super: "align-super",
};

interface ScalarValue {
  kind: "number" | "string";
  raw: string;
}

function readScalar(expression: Expression): ScalarValue | null {
  if (Node.isNumericLiteral(expression)) {
    return { kind: "number", raw: expression.getText() };
  }
  if (Node.isStringLiteral(expression)) {
    return { kind: "string", raw: expression.getLiteralValue() };
  }
  if (Node.isPrefixUnaryExpression(expression) && expression.getOperatorToken() === SyntaxKind.MinusToken) {
    const operand = expression.getOperand();
    if (Node.isNumericLiteral(operand)) {
      return { kind: "number", raw: `-${operand.getText()}` };
    }
  }
  return null;
}

function spacingClass(prefix: string, value: ScalarValue): string | null {
  if (value.kind === "number") {
    const numeric = Number.parseFloat(value.raw);
    if (Number.isNaN(numeric)) return null;
    const negative = numeric < 0;
    const magnitude = Math.abs(numeric);
    const scaled = magnitude * 2;
    const sign = negative ? "-" : "";
    if (Number.isInteger(scaled)) return `${sign}${prefix}-${scaled}`;
    return `${sign}${prefix}-[${magnitude * 8}px]`;
  }
  if (value.raw === "auto") return `${prefix}-auto`;
  return `${prefix}-[${value.raw}]`;
}

function sizingClass(prefix: string, value: ScalarValue): string | null {
  if (value.kind === "number") {
    const numeric = Number.parseFloat(value.raw);
    if (Number.isNaN(numeric)) return null;
    if (numeric === 0) return `${prefix}-0`;
    return `${prefix}-[${numeric}px]`;
  }
  if (value.raw === "100%") return `${prefix}-full`;
  if (value.raw === "auto") return `${prefix}-auto`;
  if (value.raw === "100vw") return `${prefix}-screen`;
  return `${prefix}-[${value.raw}]`;
}

function colorClass(prefix: string, value: ScalarValue): string | null {
  if (value.kind !== "string") return null;
  const token = colorTokenMap[value.raw];
  if (token) return `${prefix}-${token}`;
  if (value.raw === "white" || value.raw === "black") return `${prefix}-${value.raw}`;
  return `${prefix}-[${value.raw}]`;
}

function radiusClass(value: ScalarValue): string | null {
  if (value.kind === "number") {
    const numeric = Number.parseFloat(value.raw);
    if (Number.isNaN(numeric)) return null;
    if (numeric === 0) return "rounded-none";
    return `rounded-[${numeric * 4}px]`;
  }
  return `rounded-[${value.raw}]`;
}

function fontWeightClass(value: ScalarValue): string | null {
  const raw = value.raw;
  if (raw === "bold" || raw === "700") return "font-bold";
  if (raw === "600") return "font-semibold";
  if (raw === "medium" || raw === "500") return "font-medium";
  if (raw === "normal" || raw === "400") return "font-normal";
  if (raw === "light" || raw === "300") return "font-light";
  return null;
}

function lookupClass(key: string, value: ScalarValue): string | null {
  const spacing = spacingPrefix[key];
  if (spacing) return spacingClass(spacing, value);
  const sizing = sizingPrefix[key];
  if (sizing) return sizingClass(sizing, value);

  switch (key) {
    case "display":
      return value.kind === "string" ? (displayMap[value.raw] ?? null) : null;
    case "flexDirection":
      return value.kind === "string" ? (flexDirectionMap[value.raw] ?? null) : null;
    case "alignItems":
      return value.kind === "string" ? (alignItemsMap[value.raw] ?? null) : null;
    case "justifyContent":
      return value.kind === "string" ? (justifyContentMap[value.raw] ?? null) : null;
    case "flexWrap":
      return value.raw === "wrap" ? "flex-wrap" : value.raw === "nowrap" ? "flex-nowrap" : null;
    case "flexGrow":
      return value.raw === "1" ? "grow" : value.raw === "0" ? "grow-0" : null;
    case "flexShrink":
      return value.raw === "1" ? "shrink" : value.raw === "0" ? "shrink-0" : null;
    case "flex":
      return value.kind === "string" ? `flex-[${value.raw}]` : null;
    case "position":
      return value.kind === "string" ? (positionMap[value.raw] ?? null) : null;
    case "zIndex":
      return value.kind === "number" ? `z-[${value.raw}]` : null;
    case "textAlign":
      return value.kind === "string" ? (textAlignMap[value.raw] ?? null) : null;
    case "fontWeight":
      return fontWeightClass(value);
    case "fontSize":
      return value.kind === "number" ? `text-[${value.raw}px]` : null;
    case "lineHeight":
      return value.kind === "number" ? `leading-[${value.raw}]` : null;
    case "color":
      return colorClass("text", value);
    case "bgcolor":
    case "backgroundColor":
      return colorClass("bg", value);
    case "borderColor":
      return colorClass("border", value);
    case "borderRadius":
      return radiusClass(value);
    case "border":
      return value.raw === "1" || value.raw === "1px solid" ? "border" : null;
    case "boxShadow":
      return value.raw === "0" ? "shadow-none" : null;
    case "overflow":
      return value.kind === "string" ? `overflow-${value.raw}` : null;
    case "overflowX":
      return value.kind === "string" ? `overflow-x-${value.raw}` : null;
    case "overflowY":
      return value.kind === "string" ? `overflow-y-${value.raw}` : null;
    case "whiteSpace":
      return value.raw === "nowrap" ? "whitespace-nowrap" : null;
    case "cursor":
      return value.kind === "string" ? `cursor-${value.raw}` : null;
    case "opacity":
      return value.kind === "number" ? `opacity-[${value.raw}]` : null;
    case "letterSpacing":
      return value.kind === "number"
        ? `tracking-[${value.raw}px]`
        : value.raw === "normal"
          ? "tracking-normal"
          : `tracking-[${value.raw}]`;
    case "textTransform":
      return value.kind === "string" ? (textTransformMap[value.raw] ?? null) : null;
    case "fontStyle":
      return value.raw === "italic" ? "italic" : value.raw === "normal" ? "not-italic" : null;
    case "textDecoration":
    case "textDecorationLine":
      return value.raw === "underline"
        ? "underline"
        : value.raw === "line-through"
          ? "line-through"
          : value.raw === "overline"
            ? "overline"
            : value.raw === "none"
              ? "no-underline"
              : null;
    case "textOverflow":
      return value.raw === "ellipsis" ? "text-ellipsis" : value.raw === "clip" ? "text-clip" : null;
    case "objectFit":
      return value.kind === "string" ? (objectFitMap[value.raw] ?? null) : null;
    case "visibility":
      return value.kind === "string" ? (visibilityMap[value.raw] ?? null) : null;
    case "boxSizing":
      return value.raw === "border-box" ? "box-border" : value.raw === "content-box" ? "box-content" : null;
    case "pointerEvents":
      return value.raw === "none" ? "pointer-events-none" : value.raw === "auto" ? "pointer-events-auto" : null;
    case "userSelect":
      return value.kind === "string" ? (userSelectMap[value.raw] ?? null) : null;
    case "alignSelf":
      return value.kind === "string" ? (alignSelfMap[value.raw] ?? null) : null;
    case "justifySelf":
      return value.kind === "string" ? (justifySelfMap[value.raw] ?? null) : null;
    case "justifyItems":
      return value.kind === "string" ? (justifyItemsMap[value.raw] ?? null) : null;
    case "order":
      return value.kind === "number"
        ? Number(value.raw) < 0
          ? `-order-${Math.abs(Number(value.raw))}`
          : `order-${value.raw}`
        : null;
    case "flexBasis":
      return value.kind === "number"
        ? `basis-[${value.raw}px]`
        : value.raw === "auto"
          ? "basis-auto"
          : value.raw === "100%"
            ? "basis-full"
            : `basis-[${value.raw}]`;
    case "verticalAlign":
      return value.kind === "string" ? (verticalAlignMap[value.raw] ?? `align-[${value.raw}]`) : null;
    case "gridColumn":
      if (value.kind === "number") return `col-span-${value.raw}`;
      return /^span \d+$/.test(value.raw)
        ? `col-span-${value.raw.split(" ")[1]}`
        : `col-[${value.raw.replace(/ /g, "_")}]`;
    case "gridRow":
      if (value.kind === "number") return `row-span-${value.raw}`;
      return /^span \d+$/.test(value.raw)
        ? `row-span-${value.raw.split(" ")[1]}`
        : `row-[${value.raw.replace(/ /g, "_")}]`;
    case "gridTemplateColumns": {
      if (value.kind === "number") return `grid-cols-${value.raw}`;
      const repeat = value.raw.match(/^repeat\((\d+),/);
      return repeat ? `grid-cols-${repeat[1]}` : `grid-cols-[${value.raw.replace(/ /g, "_")}]`;
    }
    case "listStyleType":
      return value.raw === "none"
        ? "list-none"
        : value.raw === "disc"
          ? "list-disc"
          : value.raw === "decimal"
            ? "list-decimal"
            : null;
    default:
      return null;
  }
}

function classesForValue(key: string, valueExpression: Expression): { classes: string[]; mapped: boolean } {
  if (Node.isObjectLiteralExpression(valueExpression)) {
    const classes: string[] = [];
    let everyMapped = true;
    for (const property of valueExpression.getProperties()) {
      if (!Node.isPropertyAssignment(property)) {
        everyMapped = false;
        continue;
      }
      const breakpoint = property.getName();
      const prefix = breakpointPrefix[breakpoint];
      const initializer = property.getInitializer();
      const scalar = initializer ? readScalar(initializer) : null;
      const cls = scalar ? lookupClass(key, scalar) : null;
      if (prefix === undefined || !cls) {
        everyMapped = false;
        continue;
      }
      classes.push(`${prefix}${cls}`);
    }
    return { classes, mapped: everyMapped };
  }

  const scalar = readScalar(valueExpression);
  const cls = scalar ? lookupClass(key, scalar) : null;
  if (cls) return { classes: [cls], mapped: true };
  return { classes: [], mapped: false };
}

function getOpening(node: JsxOpeningElement | JsxSelfClosingElement): JsxOpeningElement | JsxSelfClosingElement {
  return node;
}

function findSxAttribute(node: JsxOpeningElement | JsxSelfClosingElement): JsxAttribute | undefined {
  for (const attribute of node.getAttributes()) {
    if (Node.isJsxAttribute(attribute) && attribute.getNameNode().getText() === "sx") return attribute;
  }
  return undefined;
}

function sxObjectLiteral(attribute: JsxAttribute): ObjectLiteralExpression | null {
  const initializer = attribute.getInitializer();
  if (!initializer || !Node.isJsxExpression(initializer)) return null;
  const expression = initializer.getExpression();
  if (expression && Node.isObjectLiteralExpression(expression)) return expression;
  return null;
}

function existingClassName(node: JsxOpeningElement | JsxSelfClosingElement): JsxAttribute | undefined {
  for (const attribute of node.getAttributes()) {
    if (Node.isJsxAttribute(attribute) && attribute.getNameNode().getText() === "className") return attribute;
  }
  return undefined;
}

interface Conversion {
  classes: string[];
  leftover: string[];
  consumedAttributeNames: Set<string>;
  warnings: string[];
}

function convertSx(object: ObjectLiteralExpression): { classes: string[]; leftover: string[] } {
  const classes: string[] = [];
  const leftover: string[] = [];
  for (const property of object.getProperties()) {
    if (!Node.isPropertyAssignment(property)) {
      leftover.push(property.getText());
      continue;
    }
    const key = property.getName();
    const initializer = property.getInitializer();
    if (!initializer) {
      leftover.push(property.getText());
      continue;
    }
    const result = classesForValue(key, initializer);
    if (result.mapped && result.classes.length) {
      classes.push(...result.classes);
    } else {
      leftover.push(property.getText());
    }
  }
  return { classes, leftover };
}

function stackSpacingClass(value: ScalarValue): string | null {
  return spacingClass("gap", value);
}

function attributeExpression(attribute: JsxAttribute): Expression | undefined {
  const initializer = attribute.getInitializer();
  if (!initializer) return undefined;
  if (Node.isStringLiteral(initializer)) return initializer;
  if (Node.isJsxExpression(initializer)) return initializer.getExpression();
  return undefined;
}

function readScalarFrom(attribute: JsxAttribute): ScalarValue | null {
  const expression = attributeExpression(attribute);
  return expression ? readScalar(expression) : null;
}

// Parse a Grid `size`/`offset` breakpoint object literal, e.g. { xs: 12, md: 6 }.
function gridLineList(expression: Expression | undefined): { bp: string; kind: "number" | "string"; raw: string }[] {
  if (!expression || !Node.isObjectLiteralExpression(expression)) return [];
  const result: { bp: string; kind: "number" | "string"; raw: string }[] = [];
  for (const property of expression.getProperties()) {
    if (!Node.isPropertyAssignment(property)) continue;
    const initializer = property.getInitializer();
    const scalar = initializer ? readScalar(initializer) : null;
    if (scalar) result.push({ bp: property.getName(), kind: scalar.kind, raw: scalar.raw });
  }
  return result;
}

function colSpanClass(bp: string, span: number): string | null {
  const prefix = breakpointPrefix[bp];
  if (prefix === undefined) return null;
  if (!Number.isInteger(span) || span < 1 || span > 12) return null;
  return `${prefix}col-span-${span}`;
}

function collectLayoutProps(
  node: JsxOpeningElement | JsxSelfClosingElement,
  tag: string,
): Conversion {
  const classes: string[] = [];
  const leftover: string[] = [];
  const consumed = new Set<string>();
  const warnings: string[] = [];

  const isGrid = tag === "Grid" || tag === "Grid2" || tag === "GridLegacy";
  if (tag === "Stack") {
    classes.push("flex", "flex-col");
  } else if (tag === "Container") {
    classes.push("mx-auto", "w-full", "px-4");
  }

  let isContainer = false;
  let hasColumns = false;

  for (const attribute of node.getAttributes()) {
    if (!Node.isJsxAttribute(attribute)) continue;
    const name = attribute.getNameNode().getText();
    if (name === "className" || name === "sx" || name === "key" || name === "ref") continue;

    if (tag === "Stack" && name === "direction") {
      consumed.add(name);
      const scalar = readScalarFrom(attribute);
      if (scalar && scalar.kind === "string") {
        const mapped = flexDirectionMap[scalar.raw];
        if (mapped) {
          const index = classes.indexOf("flex-col");
          if (index >= 0) classes.splice(index, 1);
          classes.push(mapped);
        }
      }
      continue;
    }
    if (tag === "Stack" && name === "spacing") {
      consumed.add(name);
      const scalar = readScalarFrom(attribute);
      const cls = scalar ? stackSpacingClass(scalar) : null;
      if (cls) classes.push(cls);
      continue;
    }

    if (isGrid) {
      if (name === "container") {
        consumed.add(name);
        isContainer = true;
        classes.push("grid");
        continue;
      }
      if (name === "item" || name === "zeroMinWidth") {
        consumed.add(name);
        continue;
      }
      if (name === "columns") {
        consumed.add(name);
        const scalar = readScalarFrom(attribute);
        if (scalar && scalar.kind === "number") {
          classes.push(`grid-cols-${scalar.raw}`);
          hasColumns = true;
        }
        continue;
      }
      if (name === "spacing" || name === "rowSpacing" || name === "columnSpacing") {
        consumed.add(name);
        const scalar = readScalarFrom(attribute);
        const axis = name === "rowSpacing" ? "gap-y" : name === "columnSpacing" ? "gap-x" : "gap";
        const cls = scalar ? spacingClass(axis, scalar) : null;
        if (cls) classes.push(cls);
        continue;
      }
      if (["xs", "sm", "md", "lg", "xl"].includes(name)) {
        consumed.add(name);
        const scalar = readScalarFrom(attribute);
        if (scalar && scalar.kind === "number") {
          const cls = colSpanClass(name, Number.parseInt(scalar.raw, 10));
          if (cls) classes.push(cls);
        } else {
          warnings.push(`Grid ${name} "${scalar ? scalar.raw : "auto"}" has no fixed col-span; set the column width manually`);
        }
        continue;
      }
      if (name === "size") {
        consumed.add(name);
        const expression = attributeExpression(attribute);
        const scalar = expression ? readScalar(expression) : null;
        if (scalar && scalar.kind === "number") {
          const cls = colSpanClass("xs", Number.parseInt(scalar.raw, 10));
          if (cls) classes.push(cls);
        } else if (scalar && scalar.kind === "string") {
          warnings.push(`Grid size "${scalar.raw}" has no fixed col-span; set the column width manually`);
        } else {
          for (const entry of gridLineList(expression)) {
            if (entry.kind === "number") {
              const cls = colSpanClass(entry.bp, Number.parseInt(entry.raw, 10));
              if (cls) classes.push(cls);
            } else {
              warnings.push(`Grid size ${entry.bp} "${entry.raw}" has no fixed col-span; set it manually`);
            }
          }
        }
        continue;
      }
      if (name === "offset") {
        consumed.add(name);
        const expression = attributeExpression(attribute);
        for (const entry of gridLineList(expression)) {
          if (entry.kind !== "number") continue;
          const prefix = breakpointPrefix[entry.bp];
          const offset = Number.parseInt(entry.raw, 10);
          if (prefix !== undefined && Number.isInteger(offset)) classes.push(`${prefix}col-start-${offset + 1}`);
        }
        continue;
      }
    }

    if (tag === "Container" && name === "maxWidth") {
      consumed.add(name);
      const scalar = readScalarFrom(attribute);
      if (scalar && scalar.kind === "string") {
        const px = ({ xs: 444, sm: 600, md: 900, lg: 1200, xl: 1536 } as Record<string, number>)[scalar.raw];
        classes.push(px ? `max-w-[${px}px]` : `max-w-[${scalar.raw}]`);
      }
      continue;
    }

    const expression = attributeExpression(attribute);
    if (!expression) continue;
    const result = classesForValue(name, expression);
    if (result.mapped && result.classes.length) {
      classes.push(...result.classes);
      consumed.add(name);
    }
  }

  if (isGrid && isContainer && !hasColumns) classes.push("grid-cols-12");

  void leftover;
  return { classes, leftover, consumedAttributeNames: consumed, warnings };
}

function buildClassNameAttribute(
  existing: JsxAttribute | undefined,
  classes: string[],
): { text: string | null; needsCn: boolean } {
  const cleaned = classes.filter(Boolean);
  if (!existing) {
    return { text: cleaned.length ? `className="${cleaned.join(" ")}"` : null, needsCn: false };
  }
  const initializer = existing.getInitializer();
  if (initializer && Node.isStringLiteral(initializer)) {
    const merged = [initializer.getLiteralValue(), ...cleaned].filter(Boolean).join(" ");
    return { text: merged ? `className="${merged}"` : null, needsCn: false };
  }
  if (initializer && Node.isJsxExpression(initializer)) {
    const expression = initializer.getExpression();
    const expressionText = expression ? expression.getText() : "";
    if (cleaned.length) {
      return { text: `className={cn("${cleaned.join(" ")}", ${expressionText})}`, needsCn: true };
    }
    return { text: `className={${expressionText}}`, needsCn: false };
  }
  return { text: cleaned.length ? `className="${cleaned.join(" ")}"` : null, needsCn: false };
}

export function sxFile(sourceFile: SourceFile, fullText: string): SxResult {
  const bindings = collectMuiBindings(sourceFile);
  const layoutLocalNames = new Set<string>();
  for (const binding of bindings) {
    if (layoutComponents.has(binding.canonicalName)) layoutLocalNames.add(binding.localName);
  }

  const openings: (JsxOpeningElement | JsxSelfClosingElement)[] = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ];

  const edits: Edit[] = [];
  const warnings: string[] = [];
  const convertedLayout = new Set<string>();
  let needsCn = false;

  for (const node of openings) {
    const opening = getOpening(node);
    const tagNode = opening.getTagNameNode();
    const tag = tagNode.getText();
    const isLayout = layoutLocalNames.has(tag);
    const line = node.getStartLineNumber();

    const sxAttribute = findSxAttribute(node);
    const classes: string[] = [];
    const consumed = new Set<string>();
    let leftover: string[] = [];

    if (isLayout) {
      const layout = collectLayoutProps(node, layoutCanonical(tag, bindings));
      classes.push(...layout.classes);
      for (const name of layout.consumedAttributeNames) consumed.add(name);
      for (const warning of layout.warnings) warnings.push(`line ${line} <${tag}>: ${warning}`);
    }

    if (sxAttribute) {
      const object = sxObjectLiteral(sxAttribute);
      if (object) {
        const converted = convertSx(object);
        classes.push(...converted.classes);
        leftover = converted.leftover;
        consumed.add("sx");
        if (converted.leftover.length) {
          warnings.push(`line ${line} <${tag}>: sx partially converted; ${converted.leftover.length} property(ies) remain in sx`);
        }
      } else {
        warnings.push(`line ${line} <${tag}>: sx is not an object literal; convert manually`);
      }
    }

    const targetTag = isLayout ? "div" : tag;
    const tagChanged = targetTag !== tag;
    if (tagChanged) convertedLayout.add(layoutCanonical(tag, bindings));
    if (classes.length === 0 && !tagChanged && leftover.length === 0) continue;

    const classNameAttribute = existingClassName(node);
    const built = buildClassNameAttribute(classNameAttribute, classes);
    if (built.needsCn) needsCn = true;

    const parts: string[] = [];
    for (const attribute of opening.getAttributes()) {
      if (Node.isJsxAttribute(attribute)) {
        const name = attribute.getNameNode().getText();
        if (name === "className") continue;
        if (name === "sx") {
          if (leftover.length) parts.push(`sx={{ ${leftover.join(", ")} }}`);
          continue;
        }
        if (consumed.has(name)) continue;
        parts.push(attribute.getText());
      } else {
        parts.push(attribute.getText());
      }
    }
    if (built.text) parts.push(built.text);

    const attributeText = parts.length ? " " + parts.join(" ") : "";
    const selfClosing = Node.isJsxSelfClosingElement(node);
    const openingText = `<${targetTag}${attributeText}${selfClosing ? " />" : ">"}`;
    edits.push({ start: opening.getStart(), end: opening.getEnd(), replacement: openingText });

    if (tagChanged && !selfClosing) {
      const parent = node.getParent();
      if (parent && Node.isJsxElement(parent)) {
        const closing = parent.getClosingElement();
        edits.push({ start: closing.getStart(), end: closing.getEnd(), replacement: `</${targetTag}>` });
      }
    }
  }

  if (convertedLayout.size) {
    edits.push(...buildImportEdits(sourceFile, convertedLayout, fullText));
  }

  const { edits: resolved } = resolveOverlaps(edits);
  const text = applyEdits(fullText, resolved);
  return { text, warnings, needsCn };
}

function layoutCanonical(localName: string, bindings: { localName: string; canonicalName: string }[]): string {
  const binding = bindings.find((entry) => entry.localName === localName);
  return binding ? binding.canonicalName : localName;
}
