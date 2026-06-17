export interface Edit {
  start: number;
  end: number;
  replacement: string;
}

export interface OverlapResult {
  edits: Edit[];
  dropped: Edit[];
}

function contains(outer: Edit, inner: Edit): boolean {
  const sameRange = outer.start === inner.start && outer.end === inner.end;
  return outer.start <= inner.start && outer.end >= inner.end && !sameRange;
}

function overlapsPartially(first: Edit, second: Edit): boolean {
  const intersects = first.start < second.end && second.start < first.end;
  const nested = contains(first, second) || contains(second, first);
  const identical = first.start === second.start && first.end === second.end;
  return intersects && !nested && !identical;
}

export function resolveOverlaps(edits: Edit[]): OverlapResult {
  const sorted = [...edits].sort(
    (a, b) => a.start - b.start || b.end - a.end,
  );
  const kept: Edit[] = [];
  const dropped: Edit[] = [];

  for (const edit of sorted) {
    const container = kept.find((existing) => contains(existing, edit));
    if (container) {
      dropped.push(edit);
      continue;
    }
    const partial = kept.find((existing) => overlapsPartially(existing, edit));
    if (partial) {
      dropped.push(edit);
      continue;
    }
    kept.push(edit);
  }

  return { edits: kept, dropped };
}

export function applyEdits(text: string, edits: Edit[]): string {
  const ordered = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let result = text;
  for (const edit of ordered) {
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
  }
  return result;
}
