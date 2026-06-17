import { Node, SyntaxKind } from "ts-morph";
import type { SourceFile } from "ts-morph";
import type { Edit } from "./edits.js";
import { applyEdits, resolveOverlaps } from "./edits.js";

export interface HandlerResult {
  text: string;
}

// After component conversion, controlled inputs expose onValueChange/onCheckedChange,
// whose callback receives the value/boolean directly instead of a DOM event. This pass
// rewrites inline arrow handlers to match — but only when it can do so safely:
//   (e) => setX(e.target.value)      -> (e) => setX(e)
//   (e) => setX(e.target.checked)    -> (e) => setX(e)
//   (e, v) => setX(v)                -> (v) => setX(v)        (MUI (event, value) style)
// If the event param is used for anything else (e.g. e.preventDefault()), it is left as-is
// and the existing warning still applies.
export function handlersFile(sourceFile: SourceFile, fullText: string): HandlerResult {
  const edits: Edit[] = [];

  for (const attribute of sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    const name = attribute.getNameNode().getText();
    const accessName = name === "onCheckedChange" ? "checked" : name === "onValueChange" ? "value" : null;
    if (!accessName) continue;

    const initializer = attribute.getInitializer();
    if (!initializer || !Node.isJsxExpression(initializer)) continue;
    const arrow = initializer.getExpression();
    if (!arrow || !Node.isArrowFunction(arrow)) continue;

    const params = arrow.getParameters();
    const body = arrow.getBody();

    if (params.length === 1) {
      const param = params[0];
      if (!param) continue;
      const paramName = param.getName();
      const refs = body.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => id.getText() === paramName);
      const targets = body.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).filter((access) => {
        if (access.getName() !== accessName) return false;
        const inner = access.getExpression();
        if (!Node.isPropertyAccessExpression(inner) || inner.getName() !== "target") return false;
        const base = inner.getExpression();
        return Node.isIdentifier(base) && base.getText() === paramName;
      });
      if (targets.length === 0) continue;
      // Safe only if every reference to the param is a `param.target.value/checked` access.
      if (refs.length !== targets.length) continue;
      for (const target of targets) {
        edits.push({ start: target.getStart(), end: target.getEnd(), replacement: paramName });
      }
      continue;
    }

    if (params.length === 2 && accessName === "value") {
      const first = params[0];
      const second = params[1];
      if (!first || !second) continue;
      const firstName = first.getName();
      const firstUsed = body.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => id.getText() === firstName);
      if (firstUsed) continue;
      edits.push({ start: first.getStart(), end: second.getEnd(), replacement: second.getText() });
    }
  }

  const { edits: resolved } = resolveOverlaps(edits);
  return { text: applyEdits(fullText, resolved) };
}
