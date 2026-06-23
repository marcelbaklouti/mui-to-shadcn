# mui-to-shadcn

[![CI](https://github.com/marcelbaklouti/mui-to-shadcn/actions/workflows/ci.yml/badge.svg)](https://github.com/marcelbaklouti/mui-to-shadcn/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mui-to-shadcn.svg)](https://www.npmjs.com/package/mui-to-shadcn)
[![license](https://img.shields.io/npm/l/mui-to-shadcn.svg)](./LICENSE)

A codemod that converts [Material UI](https://mui.com) (MUI) React code to [shadcn/ui](https://ui.shadcn.com). Pure AST transformation with [ts-morph](https://ts-morph.com), no LLM. Targets shadcn CLI v4 and Tailwind CSS v4, and works with both the Radix and Base UI variants of shadcn.

> Deutsche Version: [README.de.md](./README.de.md)

## What it does

Several passes over your `.ts`/`.tsx` files, designed to leave as little manual work as possible — even on large codebases:

1. **Component mapping** — MUI components are restructured into their shadcn equivalents and imports are rewritten.
2. **Infrastructure removal** — `ThemeProvider`, `CssBaseline`, `StyledEngineProvider`, the MUI/Emotion cache providers and `GlobalStyles` are unwrapped or dropped (Tailwind's preflight replaces the baseline). `createTheme`/`styled`/`makeStyles` are flagged with a warning since they wrap arbitrary CSS.
3. **Event handlers** — when `onChange` becomes `onValueChange`/`onCheckedChange`, simple inline handlers are rewritten too: `(e) => setX(e.target.value)` becomes `(e) => setX(e)`, and MUI's `(event, value) => …` becomes `(value) => …`. Handlers that also use the event are left untouched with a warning.
4. **Icons** — `@mui/icons-material` imports and usages are converted to [lucide-react](https://lucide.dev) (what shadcn uses), e.g. `DeleteIcon` → `Trash2`. ~700 icon names are mapped; `fontSize`/`color` become classes. Unmapped icons are left in place with a note.
5. **`sx` / system props** — `sx={{ ... }}` and MUI shorthand props (`m`, `p`, `display`, `gap`, `width`, `color`, ...) become Tailwind classes. MUI spacing (8px) is converted to the Tailwind scale (4px), e.g. `p: 2` becomes `p-4`. `Box`/`Stack`/`Container` become `div`; `Grid` becomes a real CSS grid (`grid grid-cols-12` + `col-span-*`, including the v6/v7 `size`/`offset` props).

## Quick start

The simplest way is the guided wizard — run it with no arguments and it walks you through the few decisions (target, Radix vs Base UI, shadcn style, and the `MIGRATION.md` LLM handoff), shows a full review, and only runs once you confirm:

```bash
npx mui-to-shadcn
```

Prefer flags? Run it directly without installing:

```bash
# dry run, prints the changes and the shadcn components it needs
npx mui-to-shadcn src --report

# write the changes
npx mui-to-shadcn src --write

# write the changes, plus a MIGRATION.md handoff for an LLM to finish the rest
npx mui-to-shadcn src --write --md
```

Or as a one-command setup in your project (installs the shadcn components, then migrates):

```bash
npx mui-to-shadcn src --setup --base radix --style vega   # base: radix|base, style: vega|nova|maia|lyra|mira
```

`--setup` will, in your project directory:

1. collect every shadcn component the migration needs,
2. set up Tailwind CSS v4 if it is missing — install `tailwindcss`/`@tailwindcss/postcss`, add `@import "tailwindcss"` to your global stylesheet, and create `postcss.config.mjs` (skip with `--skip-tailwind`),
3. run `shadcn init` (only if there is no `components.json`),
4. run `shadcn add <components>`,
5. write the converted files,
6. run `prettier --write`,
7. write `MIGRATION.md` — the LLM handoff for whatever needs manual work (skip with `--skip-md`).

Step 2 exists because `shadcn init` aborts with `TAILWIND_NOT_CONFIGURED` on a project that has no Tailwind — the normal state of an MUI/Emotion app. The setup only touches projects with no Tailwind at all; one that already ships Tailwind is left untouched. Next.js and Vite are detected automatically (for Vite the official `@tailwindcss/vite` plugin is noted as an alternative).

The package manager is detected from your lockfile (override with `--pm pnpm|npm|yarn|bun`). Use `--dry-run` to print the planned commands without running anything.

## CLI

```
mui-to-shadcn [path...] [options]

(no path, in a terminal)   start the interactive wizard

--write        write changes (default is a dry run)
--report       print every warning and manual item
--md           write MIGRATION.md — an LLM-ready handoff for the remaining manual work
--skip-sx      skip the sx / system-props pass
--setup        install shadcn components and run the full pipeline
--base <b>     radix (default) or base (Base UI)
--style <s>    vega (default) | nova | maia | lyra | mira
--preset <p>   a preset name or ui.shadcn.com code; overrides --base/--style
--pm <m>       pnpm | npm | yarn | bun (otherwise auto-detected)
--skip-tailwind with --setup: do not set up Tailwind CSS automatically
--skip-md      with --setup: do not write MIGRATION.md
--dry-run      with --setup: print planned commands only
```

`<path>` can be a file or a directory (globbed as `**/*.{ts,tsx}`, excluding node_modules). The shadcn styles (`vega`/`nova`/`maia`/`lyra`/`mira`) are described at [ui.shadcn.com/create](https://ui.shadcn.com/create); the setup passes `--preset {base}-{style}` (e.g. `radix-vega`) to `shadcn init`.

## Programmatic API

```ts
import { Project } from "ts-morph";
import { runMigration } from "mui-to-shadcn";

const project = new Project();
const file = project.addSourceFileAtPath("Component.tsx");
const result = runMigration(file, { base: "radix" });
console.log(result.text, result.warnings, result.manual, result.components);
```

`buildMigrationDoc({ files, components, base, version, generatedAt })` is also exported, if you want to generate the same `MIGRATION.md` report from your own tooling.

## Component support

115 MUI components are catalogued. As of the current version: **99 fully converted**, **7 converted inside their parent**, **4 partial**, **5 left manual** with a note. The full, always-current table is generated from the registry:

- [docs/COMPONENTS.md](./docs/COMPONENTS.md) — full status table (regenerate with `npm run docs`)

Fully converted include Button, IconButton, ButtonBase, Checkbox, Switch, RadioGroup, FormControlLabel (control converted inline), TextField, Select, the Form/Input primitives, Divider, LinearProgress, CircularProgress (lucide spinner), Skeleton, Paper, the Card family (incl. CardMedia, CardActionArea), Alert, Link, Typography, Avatar, Chip, Badge, Tooltip, Tabs (incl. the MUI Lab TabContext/TabList/TabPanel), Accordion, Dialog (incl. standalone parts), Modal, Menu (DropdownMenu), Popover/Popper, Collapse (Collapsible), ToggleButtonGroup, Drawer/SwipeableDrawer (Sheet), Breadcrumbs, Pagination, the Table family (incl. TableSortLabel), the List family, the Stepper family, the Timeline family (semantic markup), Rating (lucide stars), the Transition components (unwrapped), Fab, AppBar/Toolbar, ImageList, and Box/Stack/Container.

Plus icons: `@mui/icons-material` → `lucide-react` (~700 names mapped).

Partial (best-effort, needs review): Grid / Grid2 / GridLegacy (real CSS grid; `size="grow"`/`"auto"` are flagged) and Slider.

Still manual on purpose (different paradigm or no shadcn equivalent, with a recipe in the report): DataGrid (TanStack Table + shadcn Table), Autocomplete (Combobox = Popover + Command), TablePagination (Pagination + rows-per-page state), SpeedDial, and BottomNavigationAction. These need React state/hooks the codemod can't safely synthesize, so it leaves your working code in place rather than emit a build-breaking stub.

## What the tool does not do

Even with `--setup`, some work needs human judgement:

- **Complex handlers**: simple inline `onChange` bodies are rewritten automatically, but a handler that also uses the event (e.g. `e.preventDefault()`) or a named function reference is left as-is with a warning — adjust it by hand.
- **Custom theming**: `createTheme`/`extendTheme` palettes, `styled()`, `makeStyles`, and `keyframes` wrap arbitrary CSS, so they are flagged (not converted). Port custom tokens to your Tailwind/shadcn theme, then remove the remaining `@mui/*` / `@emotion/*` dependencies (listed by `--setup`).
- **Base UI** (if selected): replace `asChild` with the render prop; `checked` is strictly boolean and `value` strictly an array; the Base UI `Select` also needs an `items` prop on the root and `nativeButton={false}` on non-button triggers.
- **Layout and visuals**: Grid maps to CSS grid best-effort and nested whitespace is not perfect, so review the result.

Radix or Base UI: the generated JSX uses the public shadcn API (`@/components/ui/*`, `onValueChange`, `type single/multiple`, `AccordionItem`), which is identical across both; only the underlying primitives differ.

## Finish with an LLM

The codemod does the mechanical part; the rest needs judgement. `--setup` and the wizard write a **`MIGRATION.md`** automatically when any manual work remains (opt out with `--skip-md`); on the plain codemod run, add `--md` to produce it. It's a focused handoff you can give to the LLM of your choice (Claude, ChatGPT, Cursor, …):

```bash
npx mui-to-shadcn src --write --md     # or just `npx mui-to-shadcn` → the wizard does it for you
```

`MIGRATION.md` holds exactly what an assistant needs, and no more:

- a short **task brief** written to the assistant (target stack, Radix vs Base UI rules, "don't reintroduce `@mui/*`", keep behavior identical);
- the **shadcn components to install**;
- **Open / broken** — every component the codemod left for you, grouped by file with the line, the component, and a concrete recipe (e.g. `Autocomplete` → Combobox, `DataGrid` → TanStack Table);
- **Review** — auto-changes worth a second look (renamed handlers, single-select `Select`, …).

Then hand it over, for example:

> Read `MIGRATION.md` and complete every task it lists. Keep the existing behavior.

Only files with remaining work appear, so the report stays small even on large codebases.

## Compatibility

Targets shadcn CLI v4 (`shadcn init`/`add`; `--base` and `--style` map to the `{base}-{style}` preset, e.g. `radix-vega`) and Tailwind CSS v4 (v4 shadow scale, container widths). Icons require [lucide-react](https://lucide.dev) (shadcn installs it). Output is valid TSX; run Prettier/ESLint afterwards (done automatically by `--setup`).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Most contributions are component mappings in `src/mappings.ts`; the architecture and extension points are documented there.

## License

MIT (c) Marcel Baklouti. See [LICENSE](./LICENSE).
