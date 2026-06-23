# mui-to-shadcn

Codemod, der React-Code von Material UI (MUI) nach shadcn/ui konvertiert. Reine AST-Transformation mit ts-morph, kein LLM.

## Installation

```
npm install
```

## Nutzung

Am einfachsten ohne Argumente in einem Terminal — der geführte Assistent fragt Ziel, Basis (Radix/Base UI), shadcn-Stil und das MIGRATION.md-Handoff ab, zeigt eine vollständige Zusammenfassung und startet erst nach Bestätigung:

```
npx mui-to-shadcn
```

Oder direkt per Flags:

```
npm run migrate -- <pfad> --report     # Probelauf, schreibt nichts, listet benötigte shadcn-Komponenten
npm run migrate -- <pfad> --write       # schreibt Änderungen in die Dateien
npm run migrate -- <pfad> --md          # schreibt MIGRATION.md (LLM-Handoff für die restliche Handarbeit)
npm run migrate -- <pfad> --skip-sx     # überspringt den sx/System-Props-Pass
```

`<pfad>` kann eine einzelne Datei oder ein Verzeichnis sein (rekursiv `**/*.{ts,tsx}`, ohne node_modules).

### Vollautomatik: --setup

```
npm run migrate -- <pfad> --setup [--base radix|base] [--style vega|nova|maia|lyra|mira] [--preset <name|code>] [--pm pnpm|npm|yarn|bun] [--skip-tailwind] [--dry-run]
```

`--setup` führt im Projektverzeichnis nacheinander aus:

1. ermittelt in einem Probelauf alle benötigten shadcn-Komponenten
2. richtet Tailwind CSS v4 ein, falls es fehlt — installiert `tailwindcss`/`@tailwindcss/postcss`, ergänzt `@import "tailwindcss"` im globalen Stylesheet und legt `postcss.config.mjs` an (mit `--skip-tailwind` überspringbar)
3. `shadcn init --preset {radix|base}-{vega|nova|maia|lyra|mira}` (nur wenn keine components.json existiert)
4. `shadcn add <alle benötigten Komponenten>`
5. schreibt die konvertierten Dateien
6. `prettier --write`
7. schreibt `MIGRATION.md` — das LLM-Handoff für die verbleibende Handarbeit (mit `--skip-md` überspringbar)

Schritt 2 ist nötig, weil `shadcn init` auf einem Projekt ohne Tailwind mit `TAILWIND_NOT_CONFIGURED` abbricht — der übliche Zustand einer MUI/Emotion-App. Eingerichtet wird nur, wenn gar kein Tailwind vorhanden ist; ein Projekt mit bestehendem Tailwind bleibt unangetastet. Next.js und Vite werden automatisch erkannt (bei Vite wird das offizielle `@tailwindcss/vite`-Plugin als Alternative genannt).

Der Paketmanager wird aus der Lockfile erkannt (oder per `--pm` gesetzt). `--base base` wählt Base UI, `--base radix` (Default) wählt Radix. `--style` wählt den shadcn-Stil (Default `vega`; siehe [ui.shadcn.com/create](https://ui.shadcn.com/create)), `--preset <name|code>` setzt einen Preset-Namen oder Code direkt und übersteuert `--base`/`--style`. Mit `--dry-run` werden nur die geplanten Befehle ausgegeben, nichts ausgeführt.

```
npm test          # Tests
npm run typecheck # tsc --noEmit
```

## Radix oder Base UI

Die erzeugte JSX-Ausgabe nutzt die öffentliche shadcn-API (`@/components/ui/*`, onValueChange, type single/multiple, AccordionItem). Diese API ist bei Radix und Base UI identisch; nur die Primitive darunter unterscheiden sich. Ausnahmen bei Base UI: kein `asChild` (render-Prop), `checked` strikt boolean, `value` bei Slider/Select strikt Array. Mit `--base base` wird `asChild` nicht emittiert und ein Hinweis ausgegeben.

## Zwei Pässe

1. **Komponenten-Mapping**: MUI-Komponenten werden strukturell zu shadcn umgebaut, Importe umgeschrieben.
2. **sx / System-Props**: `sx={{ ... }}` und MUI-Shorthand-Props (m, p, display, gap, width, color, ...) werden zu Tailwind-Klassen. MUI-Spacing (8px) wird auf die Tailwind-Skala (4px) umgerechnet (z. B. `p: 2` -> `p-4`). Box/Stack/Grid/Container werden zu `div` mit passenden Klassen.

## Vollständig konvertierte Komponenten

Vollständige, stets aktuelle Statusübersicht (89 voll, 8 im Elternelement, 4 teilweise, 5 manuell): [docs/COMPONENTS.md](./docs/COMPONENTS.md) (neu erzeugen mit `npm run docs`).

Button, IconButton, Checkbox, Switch, Slider, RadioGroup (+ FormControlLabel/Radio), TextField (-> Label + Input/Textarea), Select (+ MenuItem), TextareaAutosize, Divider, LinearProgress, Skeleton, Paper, Card-Familie, Alert (+ AlertTitle), Link, Typography, Avatar, Chip (-> Badge), Tooltip, Tabs (+ Tab), Accordion-Familie, Dialog-Familie, ToggleButtonGroup (+ ToggleButton), Drawer (-> Sheet), Breadcrumbs, Table-Familie, Box/Stack/Grid/Container.

## Bewusst manuell (mit Notiz im Report)

Komponenten mit grundlegend anderem Paradigma oder ohne shadcn-Pendant: DataGrid, Stepper, Rating, SpeedDial, Autocomplete, Menu (anchorEl), Popover/Popper, Modal, Pagination, CircularProgress, MUI Badge, Snackbar, List-Familie, ImageList, Fab, AppBar/Toolbar, Transitions (Grow/Fade/Slide/Zoom/Collapse) u. a.

## Was --setup nicht abnimmt

Auch mit `--setup` bleibt prinzipbedingt Handarbeit, weil sie Absicht erfordert:

- **Handler-Signaturen**: onChange wird zu onValueChange/onCheckedChange/onValueChange; der Callback erhält jetzt einen Wert/boolean/Array statt eines Events. Code wie `e.target.value` oder `e.target.checked` muss angepasst werden.
- **Komponenten ohne Pendant** (siehe Liste oben) manuell umbauen.
- **MUI entfernen**: ThemeProvider, CssBaseline, createTheme, Emotion-Cache sowie `@mui/*`- und `@emotion/*`-Abhängigkeiten, sobald alles migriert ist.
- **Base UI** (falls gewählt): `asChild` durch render-Prop ersetzen, strikte boolean/Array-Props.
- **Layout und Optik**: Grid wird best-effort konvertiert; Whitespace verschachtelter Blöcke ist nicht perfekt. Nach der Migration prüfen.

Die Ausgabe ist gültiges TSX. Prettier/ESLint werden von `--setup` bereits ausgeführt; ohne `--setup`:

```
npx prettier --write <pfad>
npx eslint --fix <pfad>
```

Der Report zeigt geänderte Handler-Signaturen und alle manuell zu prüfenden Stellen.

## Mit einem LLM abschließen

Den mechanischen Teil erledigt das Tool; der Rest braucht Urteilsvermögen. `--setup` und der Assistent schreiben automatisch eine **`MIGRATION.md`**, sobald Handarbeit übrig bleibt (mit `--skip-md` abschaltbar); beim reinen Codemod-Lauf erzeugt sie `--md`. Ein kompakter Handoff für das LLM deiner Wahl (Claude, ChatGPT, Cursor, …):

```
npx mui-to-shadcn src --write --md     # oder einfach `npx mui-to-shadcn` → der Assistent macht es
```

`MIGRATION.md` enthält genau das, was ein Assistent braucht — nicht mehr und nicht weniger:

- einen kurzen **Auftrag** direkt an den Assistenten (Zielstack, Radix vs. Base UI, kein `@mui/*` reimportieren, Verhalten beibehalten);
- die zu installierenden **shadcn-Komponenten**;
- **Open / broken** — jede Komponente, die das Tool offen gelassen hat, gruppiert nach Datei mit Zeile, Komponente und konkretem Rezept (z. B. `Autocomplete` → Combobox);
- **Review** — automatische Änderungen, die man prüfen sollte (umbenannte Handler, Single-Select `Select`, …).

Dann übergeben, z. B.:

> Lies `MIGRATION.md` und erledige jede dort aufgeführte Aufgabe. Behalte das bestehende Verhalten bei.

Nur Dateien mit offener Arbeit erscheinen, die Datei bleibt also auch bei großen Codebasen klein.
