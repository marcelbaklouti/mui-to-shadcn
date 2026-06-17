import type { AttributeValue, CompositeContext, CompositeTransform, ParsedAttribute } from "./types.js";
import { renderAttribute, renderAttributeValue, valueAsChild } from "./render.js";
import { resolveButtonVariant } from "./resolvers.js";

function findAttribute(context: CompositeContext, name: string): ParsedAttribute | undefined {
  return context.element.attributes.find((attribute) => attribute.name === name);
}

function renderRemainingAttributes(context: CompositeContext, consumed: Set<string>): string {
  const parts: string[] = [];
  for (const attribute of context.element.attributes) {
    if (consumed.has(attribute.name)) continue;
    if (attribute.name === "sx") {
      context.warn("sx retained; run the sx conversion step");
    }
    parts.push(renderAttribute({ name: attribute.name, value: attribute.value }));
  }
  for (const spread of context.element.spreads) parts.push(spread.text);
  return parts.length ? " " + parts.join(" ") : "";
}

function buildClassName(
  context: CompositeContext,
  consumed: Set<string>,
  generated: string[],
): string {
  const existing = findAttribute(context, "className");
  if (!existing) {
    return generated.length ? ` className="${generated.join(" ")}"` : "";
  }
  consumed.add("className");
  if (existing.value.kind === "string") {
    const merged = [existing.value.value, ...generated].filter(Boolean).join(" ");
    return merged ? ` className="${merged}"` : "";
  }
  if (existing.value.kind === "expression") {
    if (generated.length) {
      context.registerImport({ names: ["cn"], moduleSpecifier: "@/lib/utils" });
      return ` className={cn("${generated.join(" ")}", ${existing.value.expression})}`;
    }
    return ` className={${existing.value.expression}}`;
  }
  return "";
}

const typographyVariants: Record<string, { tag: string; classes: string }> = {
  h1: { tag: "h1", classes: "scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl" },
  h2: { tag: "h2", classes: "scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight" },
  h3: { tag: "h3", classes: "scroll-m-20 text-2xl font-semibold tracking-tight" },
  h4: { tag: "h4", classes: "scroll-m-20 text-xl font-semibold tracking-tight" },
  h5: { tag: "h5", classes: "scroll-m-20 text-lg font-semibold tracking-tight" },
  h6: { tag: "h6", classes: "scroll-m-20 text-base font-semibold tracking-tight" },
  subtitle1: { tag: "p", classes: "text-base font-medium" },
  subtitle2: { tag: "p", classes: "text-sm font-medium" },
  body1: { tag: "p", classes: "leading-7" },
  body2: { tag: "p", classes: "text-sm leading-6" },
  caption: { tag: "span", classes: "text-xs text-muted-foreground" },
  overline: { tag: "span", classes: "text-xs uppercase tracking-wide" },
  button: { tag: "span", classes: "text-sm font-medium" },
};

const typographyColors: Record<string, string> = {
  "text.secondary": "text-muted-foreground",
  "text.primary": "text-foreground",
  "text.disabled": "text-muted-foreground",
  error: "text-destructive",
  primary: "text-primary",
  secondary: "text-secondary-foreground",
};

const alignClasses: Record<string, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
  justify: "text-justify",
};

export const typographyTransform: CompositeTransform = (context) => {
  const variantAttribute = findAttribute(context, "variant");
  const variant = variantAttribute?.value.kind === "string" ? variantAttribute.value.value : "body1";
  const preset = typographyVariants[variant] ?? typographyVariants.body1!;
  const classes = [preset.classes];
  const consumed = new Set<string>(["variant"]);
  let tag = preset.tag;

  const componentAttribute = findAttribute(context, "component");
  if (componentAttribute) {
    consumed.add("component");
    if (componentAttribute.value.kind === "string") tag = componentAttribute.value.value;
    else context.warn("component is dynamic; the tag defaults to the variant mapping");
  }

  for (const attribute of context.element.attributes) {
    if (attribute.name === "gutterBottom") {
      classes.push("mb-3");
      consumed.add(attribute.name);
    } else if (attribute.name === "paragraph") {
      classes.push("mb-4");
      tag = "p";
      consumed.add(attribute.name);
    } else if (attribute.name === "noWrap") {
      classes.push("truncate");
      consumed.add(attribute.name);
    } else if (attribute.name === "align" && attribute.value.kind === "string") {
      const mapped = alignClasses[attribute.value.value];
      if (mapped) classes.push(mapped);
      consumed.add(attribute.name);
    } else if (attribute.name === "color" && attribute.value.kind === "string") {
      const mapped = typographyColors[attribute.value.value];
      if (mapped) {
        classes.push(mapped);
        consumed.add(attribute.name);
      } else {
        context.warn(`color "${attribute.value.value}" not mapped`);
      }
    }
  }

  const classNameText = buildClassName(context, consumed, classes);
  const rest = renderRemainingAttributes(context, consumed);
  const inner = context.element.hasChildren ? context.element.innerText.trim() : "";
  return `<${tag}${classNameText}${rest}>${inner}</${tag}>`;
};

export const avatarTransform: CompositeTransform = (context) => {
  context.registerImport({
    names: ["Avatar", "AvatarImage", "AvatarFallback"],
    moduleSpecifier: "@/components/ui/avatar",
  });
  const srcAttribute = findAttribute(context, "src");
  const altAttribute = findAttribute(context, "alt");
  const consumed = new Set<string>(["src", "alt"]);
  const classNameText = buildClassName(context, consumed, []);
  const rest = renderRemainingAttributes(context, consumed);

  const image = srcAttribute
    ? `\n  <AvatarImage ${renderAttribute({ name: "src", value: srcAttribute.value })}${altAttribute ? " " + renderAttribute({ name: "alt", value: altAttribute.value }) : ""} />`
    : "";
  const fallbackInner = context.element.hasChildren ? context.element.innerText.trim() : "";
  if (!fallbackInner) context.warn("Avatar has no fallback content; add initials to AvatarFallback");
  const fallback = `\n  <AvatarFallback>${fallbackInner}</AvatarFallback>`;
  return `<Avatar${classNameText}${rest}>${image}${fallback}\n</Avatar>`;
};

export const cardHeaderTransform: CompositeTransform = (context) => {
  context.registerImport({
    names: ["CardHeader", "CardTitle", "CardDescription"],
    moduleSpecifier: "@/components/ui/card",
  });
  const titleAttribute = findAttribute(context, "title");
  const subheaderAttribute = findAttribute(context, "subheader");
  const consumed = new Set<string>(["title", "subheader"]);

  if (findAttribute(context, "avatar")) {
    consumed.add("avatar");
    context.warn("CardHeader avatar dropped; compose it manually");
  }
  if (findAttribute(context, "action")) {
    consumed.add("action");
    context.warn("CardHeader action dropped; compose it manually");
  }

  const rest = renderRemainingAttributes(context, consumed);
  const title = titleAttribute
    ? `\n  <CardTitle>${valueAsChild(titleAttribute.value)}</CardTitle>`
    : "";
  const description = subheaderAttribute
    ? `\n  <CardDescription>${valueAsChild(subheaderAttribute.value)}</CardDescription>`
    : "";
  const inner = context.element.hasChildren ? context.element.innerText : "";
  return `<CardHeader${rest}>${title}${description}${inner}\n</CardHeader>`;
};

export const chipTransform: CompositeTransform = (context) => {
  context.registerImport({ names: ["Badge"], moduleSpecifier: "@/components/ui/badge" });
  const labelAttribute = findAttribute(context, "label");
  const variant = findAttribute(context, "variant")?.value;
  const color = findAttribute(context, "color")?.value;
  const variantValue = variant?.kind === "string" ? variant.value : "filled";
  const colorValue = color?.kind === "string" ? color.value : undefined;

  let badgeVariant: string | undefined;
  if (variantValue === "outlined") badgeVariant = "outline";
  else if (colorValue === "error") badgeVariant = "destructive";
  else if (colorValue === "secondary") badgeVariant = "secondary";
  if (colorValue && !["error", "secondary", "primary", "default"].includes(colorValue)) {
    context.warn(`color "${colorValue}" has no badge variant`);
  }

  const consumed = new Set<string>(["label", "variant", "color"]);
  for (const droppable of ["onDelete", "icon", "avatar", "deleteIcon", "clickable", "size"]) {
    if (findAttribute(context, droppable)) {
      consumed.add(droppable);
      if (["onDelete", "icon", "avatar", "deleteIcon"].includes(droppable)) {
        context.warn(`${droppable} dropped; Badge has no built-in equivalent`);
      }
    }
  }

  const variantText = badgeVariant ? ` variant="${badgeVariant}"` : "";
  const rest = renderRemainingAttributes(context, consumed);
  const inner = labelAttribute
    ? valueAsChild(labelAttribute.value)
    : context.element.hasChildren
      ? context.element.innerText.trim()
      : "";
  return `<Badge${variantText}${rest}>${inner}</Badge>`;
};

function iconChild(value: AttributeValue): string {
  if (value.kind === "expression") {
    const expression = value.expression.trim();
    return expression.startsWith("<") ? expression : `{${expression}}`;
  }
  if (value.kind === "string") return value.value;
  return "";
}

export const buttonTransform: CompositeTransform = (context) => {
  context.registerImport({ names: ["Button"], moduleSpecifier: "@/components/ui/button" });

  const variantAttribute = findAttribute(context, "variant");
  const colorAttribute = findAttribute(context, "color");
  const variant = variantAttribute?.value.kind === "string" ? variantAttribute.value.value : undefined;
  const color = colorAttribute?.value.kind === "string" ? colorAttribute.value.value : undefined;
  if (
    (variantAttribute && variantAttribute.value.kind !== "string") ||
    (colorAttribute && colorAttribute.value.kind !== "string")
  ) {
    context.warn("variant/color is a dynamic expression; choose the shadcn variant manually");
  }
  const resolvedVariant = resolveButtonVariant(variant, color, {
    warn: context.warn,
    findAttribute: () => undefined,
  });

  const consumed = new Set<string>([
    "variant",
    "color",
    "startIcon",
    "endIcon",
    "fullWidth",
    "href",
    "component",
    "disableElevation",
    "disableRipple",
    "disableFocusRipple",
    "disableTouchRipple",
    "focusRipple",
  ]);

  const leading: string[] = [];
  if (resolvedVariant) leading.push(`variant="${resolvedVariant}"`);
  const sizeAttribute = findAttribute(context, "size");
  if (sizeAttribute?.value.kind === "string") {
    const mapped = sizeAttribute.value.value === "small" ? "sm" : sizeAttribute.value.value === "large" ? "lg" : undefined;
    if (mapped) leading.push(`size="${mapped}"`);
    consumed.add("size");
  }

  const classes: string[] = [];
  if (findAttribute(context, "fullWidth")) classes.push("w-full");

  const hrefAttribute = findAttribute(context, "href");
  let asChild = false;
  if (hrefAttribute) asChild = true;
  if (findAttribute(context, "component")) {
    asChild = true;
    context.warn("Button component -> asChild; wrap the polymorphic element as the single child");
  }
  if (asChild) leading.push("asChild");

  const startIcon = findAttribute(context, "startIcon");
  const endIcon = findAttribute(context, "endIcon");
  const inner = context.element.hasChildren ? context.element.innerText.trim() : "";
  let children = [startIcon ? iconChild(startIcon.value) : "", inner, endIcon ? iconChild(endIcon.value) : ""]
    .filter(Boolean)
    .join(" ");
  if (hrefAttribute) children = `<a href=${renderAttributeValue(hrefAttribute.value)}>${children}</a>`;

  const classText = buildClassName(context, consumed, classes);
  const remaining = renderRemainingAttributes(context, consumed);
  const leadText = leading.length ? " " + leading.join(" ") : "";
  return `<Button${leadText}${remaining}${classText}>${children}</Button>`;
};
