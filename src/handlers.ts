import { Node, SyntaxKind } from "ts-morph";
import type { ArrowFunction, FunctionDeclaration, Node as TsNode, SourceFile } from "ts-morph";
import type { Edit } from "./edits.js";
import { applyEdits, resolveOverlaps } from "./edits.js";

export interface HandlerResult {
  text: string;
}

// The safe body rewrite shared by inline arrows and resolved named handlers:
//   (e) => …e.target.value…   -> (e) => …e…    (only if e is used *only* that way)
//   (e, v) => …v…             -> (v) => …v…     (MUI (event, value), value channel)
// Returns null when it is not safe to rewrite.
function handlerRewriteEdits(params: TsNode[], body: TsNode, accessName: "value" | "checked"): Edit[] | null {
  if (params.length === 1) {
    const param = params[0];
    if (!param || !Node.isParameterDeclaration(param)) return null;
    const paramName = param.getName();
    const refs = body.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => id.getText() === paramName);
    const targets = body.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).filter((access) => {
      if (access.getName() !== accessName) return false;
      const inner = access.getExpression();
      if (!Node.isPropertyAccessExpression(inner) || inner.getName() !== "target") return false;
      const base = inner.getExpression();
      return Node.isIdentifier(base) && base.getText() === paramName;
    });
    if (targets.length === 0) return null;
    if (refs.length !== targets.length) return null;
    return targets.map((target) => ({ start: target.getStart(), end: target.getEnd(), replacement: paramName }));
  }

  if (params.length === 2 && accessName === "value") {
    const first = params[0];
    const second = params[1];
    if (!first || !second) return null;
    const firstName = first.getText().replace(/[:=].*$/s, "").trim();
    const firstUsed = body.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => id.getText() === firstName);
    if (firstUsed) return null;
    return [{ start: first.getStart(), end: second.getEnd(), replacement: second.getText() }];
  }

  return null;
}

// Resolve a handler reference (`onChange={handleX}`) to its same-file definition
// — a function declaration, `const handleX = (…) => …`, or a useCallback-wrapped
// arrow — returning its params and body for the rewrite.
function resolveHandlerDefinition(
  sourceFile: SourceFile,
  name: string,
): { params: TsNode[]; body: TsNode } | null {
  // Handlers usually live inside the component, so search all descendants (not
  // just top-level declarations), taking the first match by name.
  for (const fn of sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
    if (fn.getName() === name) {
      const body = (fn as FunctionDeclaration).getBody();
      if (body) return { params: fn.getParameters(), body };
    }
  }
  for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    if (declaration.getName() !== name) continue;
    const initializer = declaration.getInitializer();
    if (!initializer) continue;
    if (Node.isArrowFunction(initializer)) {
      return { params: initializer.getParameters(), body: (initializer as ArrowFunction).getBody() };
    }
    if (Node.isCallExpression(initializer) && initializer.getExpression().getText().endsWith("useCallback")) {
      const arg = initializer.getArguments()[0];
      if (arg && Node.isArrowFunction(arg)) {
        return { params: arg.getParameters(), body: (arg as ArrowFunction).getBody() };
      }
    }
  }
  return null;
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
  // Definitions we've already rewritten, so a handler shared by several inputs
  // is not edited twice.
  const rewrittenDefinitions = new Set<string>();

  for (const attribute of sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    const name = attribute.getNameNode().getText();
    const accessName = name === "onCheckedChange" ? "checked" : name === "onValueChange" ? "value" : null;
    if (!accessName) continue;

    const initializer = attribute.getInitializer();
    if (!initializer || !Node.isJsxExpression(initializer)) continue;
    const expression = initializer.getExpression();
    if (!expression) continue;

    if (Node.isArrowFunction(expression)) {
      const result = handlerRewriteEdits(expression.getParameters(), expression.getBody(), accessName);
      if (result) edits.push(...result);
      continue;
    }

    // Named / useCallback handler reference: rewrite its definition once.
    if (Node.isIdentifier(expression)) {
      const defName = expression.getText();
      if (rewrittenDefinitions.has(defName)) continue;
      const definition = resolveHandlerDefinition(sourceFile, defName);
      if (!definition) continue;
      const result = handlerRewriteEdits(definition.params, definition.body, accessName);
      if (result) {
        rewrittenDefinitions.add(defName);
        edits.push(...result);
      }
    }
  }

  const { edits: resolved } = resolveOverlaps(edits);
  return { text: applyEdits(fullText, resolved) };
}
