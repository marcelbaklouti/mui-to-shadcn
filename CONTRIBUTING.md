# Contributing

Thanks for helping improve `mui-to-shadcn`. This codemod is built on [ts-morph](https://ts-morph.com) and converts Material UI to shadcn/ui in two passes.

## Development

```bash
npm install
npm test          # node test runner
npm run typecheck # tsc --noEmit
npm run migrate -- examples/Sample.tsx --report   # try it on the example
```

No build is needed for development; tests and the CLI run TypeScript directly via `tsx`. `npm run build` is only used for publishing.

## Architecture

The migration never mutates the AST. It reads the tree, collects string edits as `{ start, end, replacement }`, resolves overlaps, and applies them back-to-front. This avoids ts-morph node invalidation.

- `src/imports.ts` resolves which local names map to which MUI component (barrel imports and deep default imports).
- `src/plan.ts` is the engine. It walks every JSX element and dispatches to one of four handlers, tracking a `consumed` set so a parent can claim its structural children while their inner content still converts normally:
  - **manual**: emit a warning, leave the element untouched.
  - **in-place**: rename the tag and remap props (opening tag + closing tag edits).
  - **leaf transform** (`transform`): replace the whole element with a generated string.
  - **container transform** (`containerTransform`): emit targeted edits and call `consume`/`markConverted` for the children it rewrites.
- `src/infra.ts` removes MUI/Emotion theme infrastructure (unwraps `ThemeProvider` etc., drops `CssBaseline`).
- `src/handlers.ts` rewrites simple inline event-handler bodies after the value/checked rename.
- `src/icons.ts` + `src/icon-map.ts` convert `@mui/icons-material` to `lucide-react`. The map is validated against the installed `lucide-react` by `test/icons.test.ts`, so adding a wrong name fails CI.
- `src/sx.ts` converts `sx={{ ... }}` and MUI system props to Tailwind classes, rewrites Box/Stack/Container to `div`, and Grid to a CSS grid.
- `src/mappings.ts` wires every component to its handler.

`runMigration` (`src/run.ts`) chains the passes: component mapping → infra → handlers → icons → sx.

## Adding or improving a component mapping

Most contributions are mappings. Edit `src/mappings.ts`.

Simple rename with prop changes (in-place):

```ts
registry.LinearProgress = {
  target: "Progress",
  importPath: "@/components/ui/progress",
  props: {
    variant: { drop: true, warning: "Progress is always determinate" },
  },
};
```

Structural conversion across several elements (container): add a function in `src/containers.ts` returning `Edit[]`, use the helpers (`emitWrap`, `renameTagEdits`, `consume`, `markConverted`), then wire it:

```ts
registry.Tabs = { containerTransform: tabsContainer };
```

Always add a test in `test/migration.test.ts` (or `test/sx.test.ts` for style props). After changing mappings, regenerate the status overview with `npm run docs` (it is produced from the registry into `docs/COMPONENTS.md`). Keep handler-signature changes (for example `onChange` becoming `onValueChange`) behind a clear warning, since the codemod cannot rewrite handler bodies.

## Conventions

- TypeScript strict, ESM, NodeNext. Relative imports use the `.js` extension.
- Readable identifiers, no code comments, no emojis.
- Output must be valid TSX; perfect whitespace is not a goal (users run Prettier).

## Pull requests

Run `npm run typecheck` and `npm test` before opening a PR. Describe the MUI input and the shadcn output you expect, and include a test that covers it.
