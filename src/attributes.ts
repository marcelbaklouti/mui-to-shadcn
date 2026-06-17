import { Node } from "ts-morph";
import type { JsxElement, JsxSelfClosingElement, JsxOpeningElement } from "ts-morph";
import type { AttributeValue, ParsedAttribute, ParsedElement, ParsedSpread } from "./types.js";

export function getOpeningElement(
  node: JsxElement | JsxSelfClosingElement,
): JsxOpeningElement | JsxSelfClosingElement {
  return Node.isJsxElement(node) ? node.getOpeningElement() : node;
}

function parseAttributeValue(initializer: Node | undefined): AttributeValue {
  if (!initializer) return { kind: "boolean" };
  if (Node.isStringLiteral(initializer)) {
    return { kind: "string", value: initializer.getLiteralValue() };
  }
  if (Node.isJsxExpression(initializer)) {
    const expression = initializer.getExpression();
    return { kind: "expression", expression: expression ? expression.getText() : "" };
  }
  return { kind: "expression", expression: initializer.getText() };
}

export function parseElement(
  node: JsxElement | JsxSelfClosingElement,
  fullText: string,
): ParsedElement {
  const opening = getOpeningElement(node);
  const tagName = opening.getTagNameNode().getText();
  const attributes: ParsedAttribute[] = [];
  const spreads: ParsedSpread[] = [];

  for (const attribute of opening.getAttributes()) {
    if (Node.isJsxAttribute(attribute)) {
      attributes.push({
        name: attribute.getNameNode().getText(),
        value: parseAttributeValue(attribute.getInitializer()),
        start: attribute.getStart(),
        end: attribute.getEnd(),
      });
    } else {
      spreads.push({
        text: attribute.getText(),
        start: attribute.getStart(),
        end: attribute.getEnd(),
      });
    }
  }

  let innerText = "";
  let hasChildren = false;
  if (Node.isJsxElement(node)) {
    const closing = node.getClosingElement();
    innerText = fullText.slice(node.getOpeningElement().getEnd(), closing.getStart());
    hasChildren = innerText.trim().length > 0;
  }

  return {
    tagName,
    attributes,
    spreads,
    innerText,
    selfClosing: Node.isJsxSelfClosingElement(node),
    hasChildren,
    start: node.getStart(),
    end: node.getEnd(),
  };
}
