# mui-to-shadcn

Codemod, der React-Code von Material UI (MUI) nach shadcn/ui konvertiert. Reine AST-Transformation mit ts-morph, kein LLM.

## Installation

```
npm install
```

## Nutzung

```
npm run migrate -- <pfad> --report     # Probelauf, schreibt nichts, listet benoetigte shadcn-Komponenten
npm run migrate -- <pfad> --write       # schreibt Aenderungen in die Dateien
npm run migrate -- <pfad> --skip-sx     # ueberspringt den sx/System-Props-Pass
```

`<pfad>` kann eine einzelne Datei oder ein Verzeichnis sein (rekursiv `**/*.{ts,tsx}`, ohne node_modules).

### Vollautomatik: --setup

```
npm run migrate -- <pfad> --setup [--base radix|base] [--pm pnpm|npm|yarn|bun] [--dry-run]
```

`--setup` fuehrt im Projektverzeichnis nacheinander aus:

1. ermittelt in einem Probelauf alle benoetigten shadcn-Komponenten
2. `shadcn init --base <radix|base>` (nur wenn keine components.json existiert)
3. `shadcn add <alle benoetigten Komponenten>`
4. schreibt die konvertierten Dateien
5. `prettier --write`

Der Paketmanager wird aus der Lockfile erkannt (oder per `--pm` gesetzt). `--base base` waehlt Base UI, `--base radix` (Default) waehlt Radix. Mit `--dry-run` werden nur die geplanten Befehle ausgegeben, nichts ausgefuehrt.

```
npm test          # Tests
npm run typecheck # tsc --noEmit
```

## Radix oder Base UI

Die erzeugte JSX-Ausgabe nutzt die oeffentliche shadcn-API (`@/components/ui/*`, onValueChange, type single/multiple, AccordionItem). Diese API ist bei Radix und Base UI identisch; nur die Primitive darunter unterscheiden sich. Ausnahmen bei Base UI: kein `asChild` (render-Prop), `checked` strikt boolean, `value` bei Slider/Select strikt Array. Mit `--base base` wird `asChild` nicht emittiert und ein Hinweis ausgegeben.

## Zwei Paesse

1. **Komponenten-Mapping**: MUI-Komponenten werden strukturell zu shadcn umgebaut, Importe umgeschrieben.
2. **sx / System-Props**: `sx={{ ... }}` und MUI-Shorthand-Props (m, p, display, gap, width, color, ...) werden zu Tailwind-Klassen. MUI-Spacing (8px) wird auf die Tailwind-Skala (4px) umgerechnet (z. B. `p: 2` -> `p-4`). Box/Stack/Grid/Container werden zu `div` mit passenden Klassen.

## Vollstaendig konvertierte Komponenten

Vollstaendige, stets aktuelle Statusuebersicht (89 voll, 8 im Elternelement, 4 teilweise, 5 manuell): [docs/COMPONENTS.md](./docs/COMPONENTS.md) (neu erzeugen mit `npm run docs`).

Button, IconButton, Checkbox, Switch, Slider, RadioGroup (+ FormControlLabel/Radio), TextField (-> Label + Input/Textarea), Select (+ MenuItem), TextareaAutosize, Divider, LinearProgress, Skeleton, Paper, Card-Familie, Alert (+ AlertTitle), Link, Typography, Avatar, Chip (-> Badge), Tooltip, Tabs (+ Tab), Accordion-Familie, Dialog-Familie, ToggleButtonGroup (+ ToggleButton), Drawer (-> Sheet), Breadcrumbs, Table-Familie, Box/Stack/Grid/Container.

## Bewusst manuell (mit Notiz im Report)

Komponenten mit grundlegend anderem Paradigma oder ohne shadcn-Pendant: DataGrid, Stepper, Rating, SpeedDial, Autocomplete, Menu (anchorEl), Popover/Popper, Modal, Pagination, CircularProgress, MUI Badge, Snackbar, List-Familie, ImageList, Fab, AppBar/Toolbar, Transitions (Grow/Fade/Slide/Zoom/Collapse) u. a.

## Was --setup nicht abnimmt

Auch mit `--setup` bleibt prinzipbedingt Handarbeit, weil sie Absicht erfordert:

- **Handler-Signaturen**: onChange wird zu onValueChange/onCheckedChange/onValueChange; der Callback erhaelt jetzt einen Wert/boolean/Array statt eines Events. Code wie `e.target.value` oder `e.target.checked` muss angepasst werden.
- **Komponenten ohne Pendant** (siehe Liste oben) manuell umbauen.
- **MUI entfernen**: ThemeProvider, CssBaseline, createTheme, Emotion-Cache sowie `@mui/*`- und `@emotion/*`-Abhaengigkeiten, sobald alles migriert ist.
- **Base UI** (falls gewaehlt): `asChild` durch render-Prop ersetzen, strikte boolean/Array-Props.
- **Layout und Optik**: Grid wird best-effort konvertiert; Whitespace verschachtelter Bloecke ist nicht perfekt. Nach der Migration pruefen.

Die Ausgabe ist gueltiges TSX. Prettier/ESLint werden von `--setup` bereits ausgefuehrt; ohne `--setup`:

```
npx prettier --write <pfad>
npx eslint --fix <pfad>
```

Der Report zeigt geaenderte Handler-Signaturen und alle manuell zu pruefenden Stellen.
