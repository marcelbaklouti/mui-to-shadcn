import type { AttributeValue, GeneratedAttribute } from "./types.js";

export function renderAttributeValue(value: AttributeValue): string {
  if (value.kind === "boolean") return "";
  if (value.kind === "string") return `"${value.value}"`;
  return `{${value.expression}}`;
}

export function renderAttribute(attribute: GeneratedAttribute): string {
  if (attribute.value.kind === "boolean") return attribute.name;
  return `${attribute.name}=${renderAttributeValue(attribute.value)}`;
}

export function valueAsChild(value: AttributeValue): string {
  if (value.kind === "string") return value.value;
  if (value.kind === "expression") return `{${value.expression}}`;
  return "";
}
