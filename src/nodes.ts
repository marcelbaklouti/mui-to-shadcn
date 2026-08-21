import { Node, SyntaxKind } from "ts-morph";
import type { SourceFile } from "ts-morph";
import type { Edit } from "./edits.js";
import type { JsxElementLike } from "./types.js";

// True if `localName` appears anywhere other than in an import or as a JSX tag
// name — i.e. it is used as a value (styled(X), component={X}, { icon: X },
// X.propTypes, …). Such references would dangle if the import were removed, so
// callers use this to avoid removing (or to alias) the import.
export function hasNonTagReference(sourceFile: SourceFile, localName: string): boolean {
  for (const id of sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (id.getText() !== localName) continue;
    if (id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)) continue;
    const kind = id.getParent()?.getKind();
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

export function getTagName(node: JsxElementLike): string {
  const opening = Node.isJsxElement(node) ? node.getOpeningElement() : node;
  return opening.getTagNameNode().getText();
}

export function childJsxElements(node: JsxElementLike): JsxElementLike[] {
  if (!Node.isJsxElement(node)) return [];
  const result: JsxElementLike[] = [];
  for (const child of node.getJsxChildren()) {
    if (Node.isJsxElement(child) || Node.isJsxSelfClosingElement(child)) {
      result.push(child);
    }
  }
  return result;
}

export function descendantJsxElements(node: JsxElementLike): JsxElementLike[] {
  const elements: JsxElementLike[] = [
    ...node.getDescendantsOfKind(SyntaxKind.JsxElement),
    ...node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ];
  return elements.filter((element) => element !== node);
}

export function tagNameRange(node: JsxElementLike): { start: number; end: number } {
  const opening = Node.isJsxElement(node) ? node.getOpeningElement() : node;
  const nameNode = opening.getTagNameNode();
  return { start: nameNode.getStart(), end: nameNode.getEnd() };
}

export function closingTagNameRange(node: JsxElementLike): { start: number; end: number } | null {
  if (!Node.isJsxElement(node)) return null;
  const nameNode = node.getClosingElement().getTagNameNode();
  return { start: nameNode.getStart(), end: nameNode.getEnd() };
}

export function openingElementRange(node: JsxElementLike): { start: number; end: number } {
  const opening = Node.isJsxElement(node) ? node.getOpeningElement() : node;
  return { start: opening.getStart(), end: opening.getEnd() };
}

export function closingElementRange(node: JsxElementLike): { start: number; end: number } | null {
  if (!Node.isJsxElement(node)) return null;
  const closing = node.getClosingElement();
  return { start: closing.getStart(), end: closing.getEnd() };
}

export function renameTagEdits(node: JsxElementLike, newTag: string): Edit[] {
  const opening = tagNameRange(node);
  const edits: Edit[] = [{ start: opening.start, end: opening.end, replacement: newTag }];
  const closing = closingTagNameRange(node);
  if (closing) edits.push({ start: closing.start, end: closing.end, replacement: newTag });
  return edits;
}

export function indentOf(fullText: string, start: number): string {
  const lineStart = fullText.lastIndexOf("\n", start - 1) + 1;
  const prefix = fullText.slice(lineStart, start);
  return prefix.match(/^[ \t]*/)?.[0] ?? "";
}

export function isJsxElementLike(node: Node): node is JsxElementLike {
  return Node.isJsxElement(node) || Node.isJsxSelfClosingElement(node);
}
