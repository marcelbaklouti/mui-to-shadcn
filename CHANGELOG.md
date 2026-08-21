# Changelog

All notable changes to this project are documented here. This project adheres to [Semantic Versioning](https://semver.org).

## [Unreleased]

## [0.5.0] - 2026-08-21

Scale-hardening pass toward migrating very large (10k+ component) enterprise codebases as completely and correctly as possible. Focus: stop silently skipping whole classes of files, stop emitting non-compiling output, and stop destroying styling.

### Added

- **`.js`/`.jsx` (and `.mjs`/`.cjs`) files are now scanned.** CRA- and v4-era codebases are largely `.jsx`; they were silently ignored on directory scans. The project is now opened with `allowJs`/`jsx` so JSX in these files is parsed and converted.
- **v4 support (`@material-ui/*`).** `@material-ui/core`, `@material-ui/lab`, and `@material-ui/icons` are now recognized (component/icon names are identical to v5), so v4 codebases actually convert instead of reporting "0 changes". v4 theming infra is handled too: `MuiThemeProvider` is unwrapped and `createMuiTheme` is flagged.
- **`@mui/system` support.** `Box`/`Stack`/`Container`/`Grid` imported from `@mui/system` (a common bundle-conscious pattern) now convert like their `@mui/material` equivalents, and the import is removed. Non-component exports (`styled`, `useTheme`, …) are left in place.
- **End-of-run "still references MUI" safety net.** Every file whose output still imports `@mui/*`, `@material-ui/*`, or `@emotion/*` now emits a warning and is counted in a new `Files still referencing MUI: N` CLI summary line (and exposed as `residualMui` on the programmatic result). This surfaces every silent-skip class (namespace imports, internal re-export barrels, unmapped components, dangling type imports) that previously left no trace in the report or `MIGRATION.md`.
- **Per-file error isolation.** An unexpected failure while transforming one file no longer aborts the entire run (previously fatal on a large codebase, and with `--write` it left a half-migrated tree). The file is reported (`error: <file>: … (skipped)`), counted in a `Files skipped due to errors: N` summary line, and the run continues.
- **Cross-file re-export-barrel resolution.** Enterprise design systems funnel MUI through an internal barrel (`ui/index.ts` doing `export { Button } from "@mui/material"`, consumers importing from `../ui`). A streaming pre-pass now builds the barrel map across all inputs, so consumer files that import MUI through such a barrel are fully converted (their JSX and their local-barrel imports), where before they were silently skipped entirely. Named, aliased (`Button as Btn`), deep (`export { default as Dialog } from "@mui/material/Dialog"`), and blanket (`export *`) re-exports are resolved; the barrel file itself is flagged by the residual-MUI safety net.
- **Batched processing.** The CLI enumerates file paths without parsing, then processes them in batches with a fresh ts-morph `Project` per batch, so peak memory is bounded by the batch size instead of the whole codebase (previously every file's AST was held at once — ~7–8 GB projected for 10k files).

### Fixed

- **Non-object `sx` is no longer deleted.** `sx={(theme) => …}`, `sx={[…]}`, and `sx={variable}` were dropped entirely, destroying the styling. They are now kept verbatim on the element (with a warning) so the source survives for the manual/LLM pass.
- **Arbitrary `sx` values with spaces produce one valid class.** `maxWidth: "calc(100% - 32px)"`, `flex: "1 1 auto"`, etc. now emit `max-w-[calc(100%_-_32px)]` / `flex-[1_1_auto]` instead of a space-broken class string; a trailing `!important` is stripped.
- **Fractional sizing.** MUI treats `width`/`height` numbers in `(0, 1]` as percentages: `width: 1` → `w-full`, `0.5` → `w-1/2` — no longer `w-[1px]`.
- **Numeric `flex`.** `sx={{ flex: 1 }}` → `flex-1` (was left as broken leftover `sx`).
- **Responsive `Stack`/`Grid` props.** `direction={{ xs: "column", sm: "row" }}`, `spacing={{ xs: 1, md: 4 }}`, and Grid `spacing`/`columns` breakpoint objects now emit breakpoint-prefixed classes (`sm:flex-row`, `md:gap-8`, `md:grid-cols-12`) instead of being silently dropped.
- **`ToggleButtonGroup` closing tag.** The root was rewritten to `<ToggleGroup>` but the closing tag stayed `</ToggleButtonGroup>`, so every non-self-closing group produced non-parsing JSX. The closing tag is now rewritten too. Same fix for an aliased `RadioGroup` (`RadioGroup as MuiRadioGroup`).
- **Spread props are preserved.** `<TextField {...register("email")} />` and `<Select {...field}>` (react-hook-form / Formik) silently lost the spread. Spreads are now kept on the emitted element across the container transforms and `TextField`, with a warning to verify the binding.
- **Reference-safe import removal.** A component whose local name is also used as a value — `styled(Button)`, `component={Button}`, a `{ icon: Button }` map — is no longer half-converted (which stripped the import and left the value reference dangling, or silently rebound it to the shadcn component). It is left as MUI and flagged for manual conversion, so the output always compiles. Conversion of other components in the same file is unaffected.
- **Wrapper-file name collisions.** A design-system wrapper (`import { Button as MuiButton } from "@mui/material"` + `export function Button …`) no longer emits a colliding `import { Button } from "@/components/ui/button"` (duplicate identifier) and a self-recursive wrapper. When a converted component's shadcn name would collide with a local declaration, it is left as MUI and flagged.
- **Unconditional-render gating.** `Backdrop`, `Snackbar`, and the transition wrappers (`Fade`/`Grow`/`Zoom`/`Slide`) no longer render their content permanently. The content is now gated on the controlling expression — `Backdrop`/`Snackbar` on `open`, transitions on `in` — e.g. `<Backdrop open={loading}>…` → `{loading && (<div …>…</div>)}`. `Backdrop` is centered and keeps its `onClick` (click-to-close).
- **Permanent/persistent `Drawer`.** A `variant="permanent"` Drawer (the app-shell sidebar) became a closed `Sheet` that rendered nothing. It now emits a static `<aside>` (persistent is gated on `open`); only the default `temporary` variant maps to `Sheet`. The warning points to the shadcn sidebar block for the AppBar+Drawer layout.
- **`className`/`sx` on Radix roots.** `Select`, `Dialog`, `Drawer` (Sheet), `Menu` (DropdownMenu), and `Popover` roots are bare Radix `*.Root` re-exports that accept no `className`, so `<Sheet className="w-[240px]">` was a compile error and lost styling. `className`/`sx` are now placed on the content element instead (`SheetContent`/`DialogContent`/`SelectTrigger`/`DropdownMenuContent`/`PopoverContent`), where the `sx` pass converts them to classes.
- **`Menu`/`Popover` `anchorEl` pattern.** The MUI controlled pattern (`open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}`) produced a controlled `DropdownMenu`/`Popover` whose emitted placeholder trigger *closed* the menu on click (`onOpenChange(true)` → `onClose`). It now emits an **uncontrolled** menu (the `open`/`onClose` wiring is dropped) with a visible `{/* TODO(mui-to-shadcn): move your trigger element here */}` trigger, so the remaining manual step (moving the trigger in, deleting the anchorEl state) is obvious instead of silently broken.

## [0.4.1] - 2026-06-23

Fixes `shadcn init` failing with `Invalid preset: radix-nova` / `base-nova`. shadcn CLI v4 expects the style as `--preset` (e.g. `nova`) and the primitive library as a separate `--base radix|base` flag, not a combined `{base}-{style}` name.

### Fixed

- **`shadcn init` preset and base flags.** Setup and the wizard now run `shadcn init --base radix|base --preset <style>` (e.g. `--base radix --preset nova`) instead of `--preset radix-nova`, which the CLI rejects. Custom `--preset` codes from ui.shadcn.com are still passed verbatim; `--base` is always included so Radix vs. Base UI is applied correctly.

## [0.4.0] - 2026-06-23

Makes `--setup` actually finish on a real MUI project. Previously `shadcn init` aborted on its Tailwind preflight (an MUI/Emotion app has no Tailwind), and the init command used a flag the CLI does not accept.

### Added

- **Interactive wizard.** Running `npx mui-to-shadcn` with no path in a terminal now starts a guided flow: it asks for the target folder, what to do (full setup / convert only / preview), the base (Radix vs Base UI), the shadcn style and whether to write the `MIGRATION.md` handoff — with links to the docs — then shows a full review (resolved preset, package manager, components, Tailwind actions, every command) and only runs after you confirm. Press Enter to accept the sensible defaults at each step. Built on `@clack/prompts`.
- **Selectable shadcn style.** `--style vega|nova|maia|lyra|mira` (default `vega`, the classic look) chooses the visual style; the setup passes `--preset {base}-{style}` (e.g. `radix-vega`) to `shadcn init`. `--preset <name|code>` takes a named preset or a [ui.shadcn.com](https://ui.shadcn.com/create) code verbatim, overriding base+style.
- **Automatic Tailwind CSS v4 setup in `--setup`.** When a project has no Tailwind at all — the normal state of an MUI app — the setup now installs `tailwindcss`/`@tailwindcss/postcss`, adds `@import "tailwindcss"` to the global stylesheet (an existing `globals.css`/`index.css`, or a new one under the detected `app`/`src` directory), and creates `postcss.config.mjs`. This runs before `shadcn init` so its Tailwind preflight passes. Next.js and Vite are detected; an existing PostCSS config is never overwritten (a note is printed instead). Skip it with `--skip-tailwind`. A project that already ships Tailwind is left untouched.
- **MIGRATION.md is now part of `--setup` and the wizard.** The `MIGRATION.md` LLM handoff (added in 0.3.0) is written automatically at the end of a setup/wizard run whenever manual work remains — no separate `--md` step needed. Opt out with `--skip-md`.

### Fixed

- **`shadcn init` is now non-interactive and selects the right primitives.** The init step used `--base radix|base`, which the shadcn CLI does not accept (it left init prompting for a preset). It now passes a real preset (`--preset radix-vega` / `base-vega`, or whatever `--style` resolves to), the documented way to choose Radix vs. Base UI.
- **`Button component={CustomLink}` keeps the component.** The polymorphic `component` (e.g. a Next.js/i18n `Link`) is now used as the `asChild` wrapper — `<Button asChild><CustomLink href=…>…</CustomLink></Button>` — instead of being replaced with a bare `<a>` (which dropped the component and left its import unused). String tags (`component="a"`) and a plain `href` still produce an anchor; a dynamic `component` expression is flagged for manual handling.
- **`Dialog` drops MUI-only `slotProps`/`slots`/`PaperProps`** instead of leaving them on the shadcn `Dialog` (which rejects them), with a note to move paper styling to `className` on `DialogContent`.
- **`Dialog` imports only the parts it emits.** `DialogHeader`/`DialogDescription` are no longer imported when the source has no matching content, removing unused imports from the output.

## [0.3.0] - 2026-06-18

### Added

- **`--md` flag** — writes a `MIGRATION.md` handoff so the LLM of your choice (Claude, ChatGPT, Cursor, …) can finish what the codemod cannot do on its own. It lists, per file, every **Open / broken** item (file · line · component · what's needed, with the recipe inline) and a **Review** list of auto-changes to verify, behind a short context block addressed directly to the assistant (target stack, Radix vs Base UI, Tailwind v4, controlled-value rules). Works in both dry-run and `--write`; the CLI hints to use `--md` whenever manual work remains. Manual components are no longer echoed into the Review section.
- Programmatic `buildMigrationDoc` (with `FileReport` / `MigrationDocInput` types), re-exported from the package entry, so the same report can be produced from the API.

## [0.2.0] - 2026-06-17

Driven by a real-world audit (2289 files): converts the most common remaining manual components. Catalogue grows to 115 (99 full, 7 in parent, 4 partial, 5 manual).

### Added

- **FormControlLabel** (standalone): becomes `div` + the converted control + `Label`. The control in `control={<Checkbox/Switch/Radio … />}` is converted inline (incl. `onChange` → `onCheckedChange`), with an `htmlFor`/`id` derived from the label/value.
- **Standalone Dialog parts**: `DialogTitle` → `DialogTitle`, `DialogContent` → `DialogContent`, `DialogContentText` → `DialogDescription`, `DialogActions` → `DialogFooter` (in-Dialog usage was already handled).
- **Timeline family** (MUI Lab): `Timeline`/`TimelineItem`/`TimelineSeparator`/`TimelineDot`/`TimelineConnector`/`TimelineContent`/`TimelineOppositeContent` → semantic `ul`/`li`/`div`/`span` markup (best-effort).
- **ButtonBase** → native `button`; **CardActionArea** → clickable `button`.
- **CardMedia** → `img` (with `image`→`src`, `height`/`width`→classes) or `div`.
- **TableSortLabel** → `button` + a lucide `ChevronsUpDown` icon (sorting state flagged).
- **Standalone Radio** → `RadioGroupItem` (with a "must be inside a RadioGroup" note); **standalone ToggleButton** → `Toggle`.

### Changed

- `TablePagination` now reports a concrete recipe (Pagination + rows-per-page state) instead of a generic "not in the registry" note.

## [0.1.0] - 2026-06-17

First public release.

### Added

- Multi-pass codemod (component mapping → infrastructure removal → event handlers → icons → `sx`/system-props). Pure AST transformation with ts-morph (no LLM). Targets shadcn CLI v4 + Tailwind CSS v4, and works with both the Radix and Base UI variants of shadcn.
- **Icons**: `@mui/icons-material` → `lucide-react` (~700 names mapped, validated against the installed lucide-react in CI); `fontSize`/`color` become classes; variant suffixes (Outlined/Rounded/Sharp/TwoTone) resolve to the base icon; bare references use an aliased import so the build never breaks; unmapped icons are left in place with a note.
- **Infrastructure removal**: `ThemeProvider`, `StyledEngineProvider`, `CssVarsProvider`, the MUI/Emotion cache providers (`CacheProvider`, `AppRouterCacheProvider`), `ScopedCssBaseline` are unwrapped; `CssBaseline`/`GlobalStyles` dropped; `createTheme`/`styled`/`makeStyles`/`keyframes` flagged with a warning.
- **Event handlers**: inline `onChange` bodies are rewritten when safe — `(e) => setX(e.target.value/checked)` → `(e) => setX(e)`, and MUI `(event, value) => …` → `(value) => …`; handlers that also use the event are left with a warning.
- **Grid**: converted to a real CSS grid (`grid grid-cols-12` + `col-span-*`, `gap`, breakpoint prefixes), including the v6/v7 `size`/`offset` props.
- Expanded `sx` coverage: letterSpacing, textTransform, fontStyle, textDecoration, objectFit, visibility, boxSizing, pointerEvents, userSelect, order, flexBasis, alignSelf/justifySelf/justifyItems, gridColumn/gridRow/gridTemplateColumns, verticalAlign, listStyleType, plus success/warning/info/grey/common color tokens.
- **Button**: `startIcon`/`endIcon` move into the children (then get icon-converted); `href`/`component` become `asChild` (with an anchor for `href`).
- Component mapping for Button, IconButton, Checkbox, Switch, Slider, RadioGroup, TextField, Select (+ MenuItem), Divider, LinearProgress, CircularProgress (lucide spinner), Skeleton, Paper, the Card family, Alert, Link, Typography, Avatar, Chip, Badge, Tooltip, Tabs (incl. the MUI Lab TabContext/TabList/TabPanel), Accordion, Dialog, Modal, Menu (DropdownMenu), Popover/Popper, Collapse (Collapsible), ToggleButtonGroup, Drawer/SwipeableDrawer (Sheet), Breadcrumbs, Pagination, the Table family, the List family, the Stepper family, Rating (lucide stars), the Transition components (Grow/Fade/Slide/Zoom, unwrapped), Fab, AppBar/Toolbar, ImageList, the Input/Form primitives, and Box/Stack/Grid/Container.
- `sx` and system-props pass: spacing, sizing, color, flex, position and more to Tailwind classes; MUI 8px spacing mapped to the Tailwind 4px scale; Box/Stack/Grid/Container rewritten to `div`. Output targets Tailwind v4 (v4 shadow scale and container max-width).
- Coverage: 89 of 106 catalogued components convert fully, 8 inside their parent, 4 partial (Grid/Grid2/GridLegacy, Slider), 5 manual with a note (DataGrid, Autocomplete, SpeedDial, Timeline, BottomNavigationAction).
- `--setup` orchestrator: collects the required shadcn components, runs `shadcn init`/`add`, writes the converted files, runs Prettier. Package-manager auto-detection and `--dry-run`.
- `--base radix|base` to target Radix or Base UI (omits `asChild` for Base UI).
- Programmatic API via `runMigration` and `buildRegistry`; `@mui/lab` import support.
- Generated component status overview (`docs/COMPONENTS.md`, regenerated with `npm run docs`).
