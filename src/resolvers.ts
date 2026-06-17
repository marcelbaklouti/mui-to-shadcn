import type { AttributeValue, InPlaceResolver, ResolverHelpers } from "./types.js";

function stringValue(value: AttributeValue | undefined): string | undefined {
  return value && value.kind === "string" ? value.value : undefined;
}

export function resolveButtonVariant(
  variant: string | undefined,
  color: string | undefined,
  helpers: ResolverHelpers,
): string | undefined {
  const effective = variant ?? "text";
  if (effective === "contained") {
    if (color === "error") return "destructive";
    if (color === "secondary") return "secondary";
    if (color && !["primary", "inherit"].includes(color)) {
      helpers.warn(`color "${color}" has no shadcn variant; using the default variant`);
    }
    return undefined;
  }
  if (effective === "outlined") {
    if (color === "error") {
      helpers.warn('outlined + error: the shadcn outline variant has no destructive color');
    }
    return "outline";
  }
  if (effective === "text") return "ghost";
  return undefined;
}

export const iconButtonResolver: InPlaceResolver = (attributes, helpers) => {
  const generated: { name: string; value: AttributeValue }[] = [
    { name: "variant", value: { kind: "string", value: "ghost" } },
    { name: "size", value: { kind: "string", value: "icon" } },
  ];

  for (const attribute of attributes) {
    switch (attribute.name) {
      case "color":
      case "edge":
      case "size":
      case "disableRipple":
      case "disableFocusRipple":
      case "disableTouchRipple":
        break;
      case "component":
        helpers.warn("component dropped; use asChild for polymorphic rendering");
        break;
      default:
        generated.push({ name: attribute.name, value: attribute.value });
    }
  }

  return { attributes: generated, classNames: [] };
};

export const alertResolver: InPlaceResolver = (attributes, helpers) => {
  const generated: { name: string; value: AttributeValue }[] = [];
  const severity = stringValue(attributes.find((attribute) => attribute.name === "severity")?.value);
  if (severity === "error") {
    generated.push({ name: "variant", value: { kind: "string", value: "destructive" } });
  } else if (severity && severity !== "info") {
    helpers.warn(`severity "${severity}" has no shadcn variant; using the default variant`);
  }

  for (const attribute of attributes) {
    switch (attribute.name) {
      case "severity":
        break;
      case "variant":
        helpers.warn("MUI Alert variant (filled/outlined/standard) dropped");
        break;
      case "icon":
        helpers.warn("icon dropped; place an icon element inside the Alert");
        break;
      case "onClose":
      case "action":
        helpers.warn(`${attribute.name} dropped; add a close affordance manually`);
        break;
      default:
        generated.push({ name: attribute.name, value: attribute.value });
    }
  }

  return { attributes: generated, classNames: [] };
};

export const fabResolver: InPlaceResolver = (attributes, helpers) => {
  const generated: { name: string; value: AttributeValue }[] = [];
  const classNames = ["rounded-full"];
  let variant: string | undefined;
  for (const attribute of attributes) {
    switch (attribute.name) {
      case "variant":
        variant = stringValue(attribute.value);
        break;
      case "color":
      case "size":
      case "disableRipple":
      case "disableFocusRipple":
        break;
      default:
        generated.push({ name: attribute.name, value: attribute.value });
    }
  }
  if (variant !== "extended") classNames.push("size-14");
  helpers.warn("Fab: add positioning (e.g. fixed bottom-4 right-4) manually");
  return { attributes: generated, classNames };
};

export const listItemButtonResolver: InPlaceResolver = (attributes, helpers) => {
  const generated: { name: string; value: AttributeValue }[] = [
    { name: "variant", value: { kind: "string", value: "ghost" } },
  ];
  const classNames = ["w-full", "justify-start"];
  for (const attribute of attributes) {
    switch (attribute.name) {
      case "selected":
      case "dense":
      case "disableGutters":
      case "divider":
      case "alignItems":
      case "autoFocus":
        break;
      default:
        generated.push({ name: attribute.name, value: attribute.value });
    }
  }
  void helpers;
  return { attributes: generated, classNames };
};
