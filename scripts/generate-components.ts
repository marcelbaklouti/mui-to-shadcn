import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildRegistry } from "../src/mappings.js";

const registry = buildRegistry();

const layoutFull: Record<string, string> = {
  Box: "div",
  Stack: "div (flex, gap from spacing)",
  Container: "div (mx-auto, max-width)",
};

const layoutPartial: Record<string, string> = {
  Grid: "div (grid grid-cols-12 + col-span)",
  Grid2: "div (grid grid-cols-12 + col-span)",
  GridLegacy: "div (grid grid-cols-12 + col-span)",
};

const inParent: Record<string, string> = {
  AccordionSummary: "AccordionTrigger (in Accordion)",
  AccordionDetails: "AccordionContent (in Accordion)",
  Tab: "TabsTrigger (in Tabs)",
  Radio: "RadioGroupItem (in RadioGroup)",
  ToggleButton: "ToggleGroupItem (in ToggleButtonGroup)",
  TabList: "TabsList (in TabContext)",
  TabPanel: "TabsContent (in TabContext)",
};

const targetOverride: Record<string, string> = {
  Avatar: "Avatar + AvatarImage/AvatarFallback",
  CardHeader: "CardHeader + CardTitle/CardDescription",
  Chip: "Badge",
  Typography: "h1-h4 / p (per variant)",
  TextField: "Label + Input/Textarea",
  Select: "Select + Trigger/Content/Item",
  RadioGroup: "RadioGroup + RadioGroupItem",
  Dialog: "Dialog + Content/Title/Description/Footer",
  Tabs: "Tabs + TabsList/TabsTrigger",
  Accordion: "Accordion + Item/Trigger/Content",
  Drawer: "Sheet + SheetContent",
  Breadcrumbs: "Breadcrumb + List/Item/Link/Page",
  Tooltip: "Tooltip + Provider/Trigger/Content",
  TableHead: "TableHeader (+ TableHead cells)",
  ToggleButtonGroup: "ToggleGroup + ToggleGroupItem",
  Menu: "DropdownMenu + Trigger/Content/Item",
  MenuList: "DropdownMenu + Trigger/Content/Item",
  Popover: "Popover + Trigger/Content",
  Popper: "Popover + Trigger/Content",
  Modal: "Dialog + DialogContent",
  Collapse: "Collapsible + CollapsibleContent",
  SwipeableDrawer: "Sheet + SheetContent",
  Badge: "span + Badge (positioned)",
  Snackbar: "sonner (toast)",
  TabContext: "Tabs + List/Trigger/Content",
  CircularProgress: "Loader2 (lucide spinner)",
  Pagination: "Pagination (static markup)",
  Rating: "Star row (lucide)",
  StepLabel: "span",
  FormHelperText: "p",
  ListItemText: "div + span",
  ClickAwayListener: "(unwrapped)",
  Portal: "(unwrapped)",
  Fade: "(unwrapped)",
  Grow: "(unwrapped)",
  Zoom: "(unwrapped)",
  Slide: "(unwrapped)",
  FormControlLabel: "div + control + Label",
  Timeline: "ul + li/div/span (semantic)",
  CardMedia: "img",
  TableSortLabel: "button + sort icon",
  DialogContent: "DialogContent",
  DialogTitle: "DialogTitle",
  DialogContentText: "DialogDescription",
  DialogActions: "DialogFooter",
};

const notes: Record<string, string> = {
  Checkbox: "onChange becomes onCheckedChange (boolean)",
  Switch: "onChange becomes onCheckedChange (boolean)",
  Select: "onChange becomes onValueChange (value string)",
  Dialog: "add DialogHeader manually; onClose becomes onOpenChange",
  Drawer: "add SheetTrigger if needed; onClose becomes onOpenChange",
  Tabs: "panels live outside Tabs in MUI; add TabsContent",
  Tooltip: "Base UI: replace asChild with the render prop",
  Paper: "elevation becomes shadow; square becomes rounded-none",
  IconButton: "becomes Button variant ghost, size icon",
  Chip: "MUI Badge is separate (counter) and stays manual",
  Link: "becomes a native a element",
  Menu: "anchorEl dropped; replace the trigger element",
  MenuList: "anchorEl dropped; replace the trigger element",
  Popover: "anchorEl dropped; replace the trigger; onClose becomes onOpenChange",
  Popper: "anchorEl dropped; replace the trigger; onClose becomes onOpenChange",
  Modal: "add DialogTrigger/DialogHeader if needed; onClose becomes onOpenChange",
  Collapse: "add a CollapsibleTrigger; in becomes open",
  SwipeableDrawer: "add SheetTrigger if needed; onClose becomes onOpenChange",
  Badge: "positioned overlay over the child",
  Snackbar: "imperative; use sonner and add a <Toaster />",
  TabContext: "MUI Lab; panels become TabsContent",
  CircularProgress: "spinner shows no determinate progress",
  Pagination: "static markup; render pages from count",
  Rating: "wire up value/interaction manually",
  ClickAwayListener: "removed; content preserved",
  Portal: "removed; content preserved",
  Fade: "unwrapped; recreate animation with tw-animate-css",
  Grow: "unwrapped; recreate animation with tw-animate-css",
  Zoom: "unwrapped; recreate animation with tw-animate-css",
  Slide: "unwrapped; recreate animation with tw-animate-css",
  FormControlLabel: "the control (Checkbox/Switch/Radio) is converted inline",
  Timeline: "best-effort semantic markup; review the layout",
  Radio: "standalone works; must be inside a RadioGroup",
  ButtonBase: "native button (unstyled); add styling or use Button",
  TableSortLabel: "active/direction dropped; wire sorting manually",
};

const partialNotes: Record<string, string> = {
  Grid: "real CSS grid; size=\"grow\"/\"auto\" are flagged",
  Grid2: "real CSS grid; size=\"grow\"/\"auto\" are flagged",
  GridLegacy: "real CSS grid; size=\"grow\"/\"auto\" are flagged",
  Slider: "value/defaultValue must be an array; onChange becomes onValueChange",
};

type Status = "full" | "partial" | "in-parent" | "manual";

interface Row {
  mui: string;
  shadcn: string;
  note: string;
  status: Status;
}

function targetFor(canonical: string): string {
  const mapping = registry[canonical];
  return targetOverride[canonical] ?? mapping?.target ?? "";
}

const rows: Row[] = [];
const canonicals = new Set<string>([...Object.keys(registry), ...Object.keys(inParent)]);

for (const canonical of canonicals) {
  const mapping = registry[canonical];

  if (canonical in inParent) {
    rows.push({ mui: canonical, shadcn: inParent[canonical] ?? "", note: "only inside its parent", status: "in-parent" });
    continue;
  }
  if (canonical in layoutFull) {
    rows.push({ mui: canonical, shadcn: layoutFull[canonical] ?? "", note: "in the sx / system-props pass", status: "full" });
    continue;
  }
  if (canonical in layoutPartial) {
    rows.push({ mui: canonical, shadcn: layoutPartial[canonical] ?? "", note: partialNotes[canonical] ?? "", status: "partial" });
    continue;
  }
  if (mapping?.manual) {
    rows.push({ mui: canonical, shadcn: "", note: mapping.manual, status: "manual" });
    continue;
  }
  if (canonical in partialNotes) {
    rows.push({ mui: canonical, shadcn: targetFor(canonical), note: partialNotes[canonical] ?? "", status: "partial" });
    continue;
  }
  rows.push({ mui: canonical, shadcn: targetFor(canonical), note: notes[canonical] ?? "", status: "full" });
}

rows.sort((a, b) => a.mui.localeCompare(b.mui));

const byStatus = (status: Status) => rows.filter((row) => row.status === status);

function table(list: Row[], withTarget: boolean): string {
  if (!list.length) return "_none_\n";
  const header = withTarget ? "| MUI | shadcn/ui | Note |\n| --- | --- | --- |\n" : "| MUI | Note |\n| --- | --- |\n";
  const body = list
    .map((row) => (withTarget ? `| ${row.mui} | ${row.shadcn || "-"} | ${row.note || "-"} |` : `| ${row.mui} | ${row.note || "-"} |`))
    .join("\n");
  return header + body + "\n";
}

const full = byStatus("full");
const partial = byStatus("partial");
const parent = byStatus("in-parent");
const manual = byStatus("manual");

const content = `# Component support

> Auto-generated from the registry (\`src/mappings.ts\`). Regenerate with \`npm run docs\`.

Catalogued: ${rows.length} MUI components. Full: ${full.length}, in parent: ${parent.length}, partial: ${partial.length}, manual: ${manual.length}.

Plus \`@mui/icons-material\` → \`lucide-react\` (~700 icon names mapped) and MUI theme/Emotion infrastructure removal (\`ThemeProvider\`, \`CssBaseline\`, cache providers).

Legend: **Full** = structurally fully converted. **In parent** = converted automatically when nested in the matching container. **Partial** = converted but needs follow-up. **Manual** = left in place (no equivalent, or a fundamentally different one), with a note.

## Fully converted

${table(full, true)}
## Converted inside the parent

${table(parent, true)}
## Partial (needs follow-up)

${table(partial, true)}
## Manual (no or different equivalent)

${table(manual, false)}`;

const outputPath = join(process.cwd(), "docs", "COMPONENTS.md");
writeFileSync(outputPath, content);
console.log(`docs/COMPONENTS.md written: ${full.length} full, ${parent.length} in parent, ${partial.length} partial, ${manual.length} manual`);
