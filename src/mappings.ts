import type { AttributeValue, ComponentMapping, Registry } from "./types.js";
import { alertResolver, fabResolver, iconButtonResolver, listItemButtonResolver } from "./resolvers.js";
import {
  avatarTransform,
  buttonTransform,
  cardHeaderTransform,
  chipTransform,
  typographyTransform,
} from "./composites.js";
import {
  accordionContainer,
  badgeContainer,
  breadcrumbsContainer,
  circularProgressTransform,
  collapseContainer,
  dialogContainer,
  drawerContainer,
  formHelperTextTransform,
  listItemTextTransform,
  menuContainer,
  modalContainer,
  paginationTransform,
  popoverContainer,
  radioGroupContainer,
  ratingTransform,
  selectContainer,
  snackbarContainer,
  stepLabelTransform,
  tabContextContainer,
  tableHeadContainer,
  tabsContainer,
  textFieldTransform,
  toggleGroupContainer,
  tooltipContainer,
  transitionContainer,
  unwrapContainer,
} from "./containers.js";

function tableCellAlignToClass(value: AttributeValue): string | null {
  if (value.kind !== "string") return null;
  switch (value.value) {
    case "center":
      return "text-center";
    case "right":
      return "text-right";
    case "left":
      return "text-left";
    default:
      return null;
  }
}

function dimensionToClass(axis: "w" | "h", value: AttributeValue): string | null {
  if (value.kind === "string") {
    if (value.value === "100%") return `${axis}-full`;
    return `${axis}-[${value.value}]`;
  }
  if (value.kind === "expression") {
    if (/^\d+$/.test(value.expression)) return `${axis}-[${value.expression}px]`;
    return `${axis}-[${value.expression}]`;
  }
  return null;
}

function elevationToShadow(value: AttributeValue): string | null {
  if (value.kind !== "string" && value.kind !== "expression") return null;
  const raw = value.kind === "string" ? value.value : value.expression;
  const level = Number.parseInt(raw, 10);
  if (Number.isNaN(level)) return null;
  if (level <= 0) return "shadow-none";
  if (level === 1) return "shadow-xs";
  if (level <= 4) return "shadow-sm";
  if (level <= 8) return "shadow-md";
  if (level <= 16) return "shadow-lg";
  return "shadow-xl";
}

function skeletonVariantToClass(value: AttributeValue): string | null {
  if (value.kind !== "string") return null;
  switch (value.value) {
    case "circular":
      return "rounded-full";
    case "rectangular":
      return "rounded-none";
    case "rounded":
      return "rounded-md";
    default:
      return null;
  }
}

function linkUnderlineToClass(value: AttributeValue): string | null {
  if (value.kind !== "string") return null;
  switch (value.value) {
    case "none":
      return "no-underline";
    case "hover":
      return "no-underline hover:underline";
    case "always":
      return "underline";
    default:
      return null;
  }
}

function squareToClass(): string {
  return "rounded-none";
}

function manual(message: string): ComponentMapping {
  return { manual: message };
}

function deferred(): ComponentMapping {
  return { manual: "layout component: converted in the sx / system-props pass" };
}

const manualComponents: Record<string, string> = {
  AccordionSummary: "AccordionSummary maps to AccordionTrigger (converted automatically inside Accordion)",
  AccordionDetails: "AccordionDetails maps to AccordionContent (converted automatically inside Accordion)",
  Tab: "Tab maps to TabsTrigger (converted automatically inside Tabs)",
  FormControlLabel: "FormControlLabel is dropped; combine Label with the control (converted automatically inside RadioGroup)",
  Radio: "Radio maps to RadioGroupItem (converted automatically inside RadioGroup)",
  TabList: "TabList maps to TabsList (converted automatically inside TabContext)",
  TabPanel: "TabPanel maps to TabsContent (converted automatically inside TabContext)",
  Autocomplete: "Autocomplete -> shadcn Combobox (Popover + Command + Button); needs useState/open state, so build it manually (shadcn add command popover button)",
  DataGrid: "DataGrid -> shadcn Table + @tanstack/react-table (Data Table recipe); needs columns/hooks, so build it manually (shadcn add table; npm i @tanstack/react-table)",
  SpeedDial: "SpeedDial has no equivalent; use DropdownMenu or custom floating actions",
  Timeline: "Timeline has no equivalent; build it manually with flex/grid",
  BottomNavigationAction: "BottomNavigationAction has no equivalent; use a Link/Button in the navigation bar",
};

const layoutComponents = ["Box", "Stack", "Grid", "Grid2", "GridLegacy", "Container"];

export function buildRegistry(): Registry {
  const registry: Registry = {};

  registry.Button = { transform: buttonTransform };

  registry.IconButton = {
    target: "Button",
    importPath: "@/components/ui/button",
    resolve: iconButtonResolver,
  };

  registry.Checkbox = {
    target: "Checkbox",
    importPath: "@/components/ui/checkbox",
    props: {
      onChange: {
        rename: "onCheckedChange",
        warning: "Checkbox onChange -> onCheckedChange; the handler now receives a boolean instead of an event",
      },
      color: { drop: true },
      size: { drop: true },
      indeterminate: { drop: true, warning: "indeterminate dropped; set the state manually via data-state" },
      inputProps: { drop: true, warning: "inputProps dropped; pass attributes directly to the Checkbox" },
    },
  };

  registry.Switch = {
    target: "Switch",
    importPath: "@/components/ui/switch",
    props: {
      onChange: {
        rename: "onCheckedChange",
        warning: "Switch onChange -> onCheckedChange; the handler now receives a boolean instead of an event",
      },
      color: { drop: true },
      size: { drop: true },
    },
  };

  registry.Divider = {
    target: "Separator",
    importPath: "@/components/ui/separator",
    props: {
      flexItem: { drop: true },
      light: { drop: true },
      variant: { drop: true, warning: "Divider variant dropped; Separator has no inset variants" },
      textAlign: { drop: true, warning: "Divider textAlign dropped; Separator carries no text" },
    },
    warnIfChildren: "a Divider with content has no Separator equivalent; build it manually",
  };

  registry.LinearProgress = {
    target: "Progress",
    importPath: "@/components/ui/progress",
    props: {
      variant: { drop: true, warning: "LinearProgress variant dropped; Progress is always determinate" },
      color: { drop: true },
      valueBuffer: { drop: true, warning: "valueBuffer dropped; Progress has no buffer" },
    },
  };

  registry.Skeleton = {
    target: "Skeleton",
    importPath: "@/components/ui/skeleton",
    props: {
      variant: { toClassName: skeletonVariantToClass },
      width: { toClassName: (value) => dimensionToClass("w", value) },
      height: { toClassName: (value) => dimensionToClass("h", value) },
      animation: { drop: true, warning: "animation dropped; Skeleton pulses by default" },
    },
  };

  registry.Paper = {
    target: "div",
    defaultClassName: "rounded-lg border bg-card text-card-foreground",
    props: {
      elevation: { toClassName: elevationToShadow },
      square: { toClassName: squareToClass },
      variant: { drop: true },
      component: { drop: true, warning: "component dropped; replace the tag directly" },
    },
  };

  registry.Card = {
    target: "Card",
    importPath: "@/components/ui/card",
    props: {
      elevation: { toClassName: elevationToShadow },
      square: { toClassName: squareToClass },
      variant: { drop: true },
      raised: { drop: true },
    },
  };

  registry.CardContent = {
    target: "CardContent",
    importPath: "@/components/ui/card",
  };

  registry.CardActions = {
    target: "CardFooter",
    importPath: "@/components/ui/card",
    props: {
      disableSpacing: { drop: true },
    },
  };

  registry.Alert = {
    target: "Alert",
    importPath: "@/components/ui/alert",
    resolve: alertResolver,
    notes: "wrap the Alert text in AlertDescription; AlertTitle is preserved",
  };

  registry.AlertTitle = {
    target: "AlertTitle",
    importPath: "@/components/ui/alert",
  };

  registry.Link = {
    target: "a",
    props: {
      underline: { toClassName: linkUnderlineToClass },
      color: { drop: true, warning: "Link color dropped; set the text color via classes" },
      component: { drop: true, warning: "component dropped; replace the tag directly" },
      TypographyClasses: { drop: true },
    },
  };

  registry.Typography = { transform: typographyTransform };
  registry.Avatar = { transform: avatarTransform };
  registry.CardHeader = { transform: cardHeaderTransform };
  registry.Tooltip = { containerTransform: tooltipContainer };
  registry.Chip = { transform: chipTransform };

  registry.TextField = { transform: textFieldTransform };

  registry.Select = { containerTransform: selectContainer };
  registry.Accordion = { containerTransform: accordionContainer };
  registry.Tabs = { containerTransform: tabsContainer };
  registry.RadioGroup = { containerTransform: radioGroupContainer };
  registry.Dialog = { containerTransform: dialogContainer };
  registry.ToggleButtonGroup = { containerTransform: toggleGroupContainer };
  registry.Drawer = { containerTransform: drawerContainer };
  registry.Breadcrumbs = { containerTransform: breadcrumbsContainer };
  registry.TableHead = { containerTransform: tableHeadContainer };

  registry.MenuItem = {
    target: "SelectItem",
    importPath: "@/components/ui/select",
    props: {
      onClick: { drop: true, warning: "MenuItem onClick dropped; SelectItem responds via the Select's onValueChange" },
      dense: { drop: true },
      divider: { drop: true },
      disableGutters: { drop: true },
      selected: { drop: true },
    },
  };

  registry.Slider = {
    target: "Slider",
    importPath: "@/components/ui/slider",
    props: {
      onChange: { rename: "onValueChange", warning: "Slider onChange -> onValueChange; the handler now receives an array instead of (event, value)" },
      value: { warning: "Slider value must be an array (e.g. value={[50]})" },
      defaultValue: { warning: "Slider defaultValue must be an array (e.g. defaultValue={[50]})" },
      marks: { drop: true, warning: "Slider marks dropped; the shadcn Slider has no marks" },
      valueLabelDisplay: { drop: true },
      valueLabelFormat: { drop: true },
      track: { drop: true },
      orientation: { drop: true, warning: "Slider orientation dropped; set the orientation via classes" },
      color: { drop: true },
      size: { drop: true },
      scale: { drop: true },
    },
  };

  registry.TextareaAutosize = { target: "Textarea", importPath: "@/components/ui/textarea" };

  registry.Table = { target: "Table", importPath: "@/components/ui/table" };
  registry.TableBody = { target: "TableBody", importPath: "@/components/ui/table" };
  registry.TableRow = { target: "TableRow", importPath: "@/components/ui/table" };
  registry.TableFooter = { target: "TableFooter", importPath: "@/components/ui/table" };
  registry.TableCell = {
    target: "TableCell",
    importPath: "@/components/ui/table",
    props: {
      align: { toClassName: tableCellAlignToClass },
      padding: { drop: true },
      size: { drop: true },
      component: { drop: true },
      scope: { drop: true },
      sortDirection: { drop: true },
      variant: { drop: true },
    },
  };
  registry.TableContainer = {
    target: "div",
    props: {
      component: { drop: true, warning: "TableContainer component dropped; the shadcn Table ships its own container" },
    },
  };

  registry.Menu = { containerTransform: menuContainer };
  registry.MenuList = { containerTransform: menuContainer };
  registry.Popover = { containerTransform: popoverContainer };
  registry.Popper = { containerTransform: popoverContainer };
  registry.Modal = { containerTransform: modalContainer };
  registry.Collapse = { containerTransform: collapseContainer };
  registry.SwipeableDrawer = { containerTransform: drawerContainer };
  registry.ClickAwayListener = { containerTransform: unwrapContainer("ClickAwayListener") };
  registry.Portal = { containerTransform: unwrapContainer("Portal") };

  registry.Badge = { containerTransform: badgeContainer };
  registry.Snackbar = { containerTransform: snackbarContainer };
  registry.CircularProgress = { transform: circularProgressTransform };
  registry.Pagination = { transform: paginationTransform };
  registry.TabContext = { containerTransform: tabContextContainer };

  registry.Rating = { transform: ratingTransform };
  registry.Stepper = {
    target: "ol",
    defaultClassName: "flex flex-wrap items-center gap-4",
    props: {
      activeStep: { drop: true, warning: "Stepper activeStep: set the active-step styling manually" },
      orientation: { drop: true, warning: "Stepper orientation: set the orientation via classes (flex-col)" },
      alternativeLabel: { drop: true },
      nonLinear: { drop: true },
      connector: { drop: true },
    },
  };
  registry.Step = {
    target: "li",
    defaultClassName: "flex items-center gap-2",
    props: {
      completed: { drop: true },
      disabled: { drop: true },
      active: { drop: true },
      index: { drop: true },
      last: { drop: true },
      expanded: { drop: true },
    },
  };
  registry.StepLabel = { transform: stepLabelTransform };
  registry.StepContent = {
    target: "div",
    defaultClassName: "ml-4 border-l pl-4",
    props: { TransitionComponent: { drop: true }, transitionDuration: { drop: true }, last: { drop: true } },
  };

  registry.Fade = { containerTransform: transitionContainer("Fade", "animate-in fade-in / animate-out fade-out") };
  registry.Grow = { containerTransform: transitionContainer("Grow", "animate-in zoom-in") };
  registry.Zoom = { containerTransform: transitionContainer("Zoom", "animate-in zoom-in") };
  registry.Slide = { containerTransform: transitionContainer("Slide", "animate-in slide-in-from-bottom") };

  const inputMapping: ComponentMapping = {
    target: "Input",
    importPath: "@/components/ui/input",
    props: {
      variant: { drop: true },
      margin: { drop: true },
      disableUnderline: { drop: true },
      fullWidth: { toClassName: () => "w-full" },
      error: { drop: true, warning: "Input error: add error styling and FormMessage manually" },
      startAdornment: { drop: true, warning: "adornment dropped; position the icon via layout" },
      endAdornment: { drop: true, warning: "adornment dropped; position the icon via layout" },
    },
  };
  registry.Input = inputMapping;
  registry.OutlinedInput = inputMapping;
  registry.FilledInput = inputMapping;
  registry.InputBase = inputMapping;

  registry.NativeSelect = {
    target: "select",
    props: {
      variant: { drop: true },
      input: { drop: true },
      IconComponent: { drop: true },
    },
    notes: "NativeSelect becomes a native select; use the shadcn Select for styling if needed",
  };

  registry.FormLabel = { target: "Label", importPath: "@/components/ui/label", props: { focused: { drop: true }, error: { drop: true }, filled: { drop: true } } };
  registry.InputLabel = { target: "Label", importPath: "@/components/ui/label", props: { shrink: { drop: true }, focused: { drop: true }, error: { drop: true }, variant: { drop: true }, margin: { drop: true }, disableAnimation: { drop: true } } };
  registry.FormHelperText = { transform: formHelperTextTransform };
  registry.FormControl = {
    target: "div",
    props: {
      fullWidth: { toClassName: () => "w-full" },
      variant: { drop: true },
      margin: { drop: true },
      size: { drop: true },
      error: { drop: true },
      focused: { drop: true },
      hiddenLabel: { drop: true },
    },
  };
  registry.FormGroup = {
    target: "div",
    defaultClassName: "flex flex-col gap-2",
    props: { row: { drop: true, warning: "FormGroup row dropped; set the orientation via classes (flex-row)" } },
  };
  registry.InputAdornment = {
    target: "span",
    defaultClassName: "inline-flex items-center",
    props: { position: { drop: true }, disablePointerEvents: { drop: true }, variant: { drop: true } },
  };

  registry.Fab = { target: "Button", importPath: "@/components/ui/button", resolve: fabResolver };

  registry.AppBar = {
    target: "header",
    defaultClassName: "w-full",
    props: {
      position: { drop: true, warning: "AppBar position dropped; set it via classes (sticky top-0 / fixed)" },
      color: { drop: true },
      elevation: { drop: true },
      enableColorOnDark: { drop: true },
    },
  };
  registry.Toolbar = {
    target: "div",
    defaultClassName: "flex min-h-16 items-center gap-4 px-4",
    props: { variant: { drop: true }, disableGutters: { drop: true } },
  };
  registry.BottomNavigation = {
    target: "nav",
    defaultClassName: "flex items-center justify-around border-t",
    props: {
      showLabels: { drop: true },
      onChange: { drop: true, warning: "BottomNavigation onChange dropped; wire up navigation manually" },
    },
  };

  registry.ImageList = {
    target: "div",
    defaultClassName: "grid gap-2",
    props: {
      cols: { drop: true, warning: "ImageList cols dropped; set grid-cols-N manually" },
      rowHeight: { drop: true },
      gap: { drop: true },
      variant: { drop: true },
    },
  };
  registry.ImageListItem = { target: "div", props: { cols: { drop: true }, rows: { drop: true } } };

  registry.Backdrop = {
    target: "div",
    defaultClassName: "fixed inset-0 z-50 bg-black/50",
    props: {
      open: { drop: true, warning: "Backdrop open dropped; control visibility with a condition" },
      invisible: { drop: true },
    },
  };

  registry.List = {
    target: "ul",
    props: {
      dense: { drop: true },
      disablePadding: { drop: true },
      subheader: { drop: true, warning: "List subheader dropped; add it as a ListSubheader element" },
    },
  };
  registry.ListItem = {
    target: "li",
    defaultClassName: "flex items-center",
    props: {
      disableGutters: { drop: true },
      disablePadding: { drop: true },
      dense: { drop: true },
      alignItems: { drop: true },
      divider: { toClassName: () => "border-b" },
      secondaryAction: { drop: true, warning: "ListItem secondaryAction dropped; add it as a child element" },
    },
  };
  registry.ListItemButton = { target: "Button", importPath: "@/components/ui/button", resolve: listItemButtonResolver };
  registry.ListItemText = { transform: listItemTextTransform };
  registry.ListItemIcon = { target: "span", defaultClassName: "mr-3 inline-flex" };
  registry.ListItemAvatar = { target: "span", defaultClassName: "mr-3 inline-flex" };
  registry.ListItemSecondaryAction = { target: "span", defaultClassName: "ml-auto" };
  registry.ListSubheader = {
    target: "li",
    defaultClassName: "px-4 py-2 text-sm font-medium text-muted-foreground",
    props: { disableGutters: { drop: true }, disableSticky: { drop: true }, inset: { drop: true } },
  };

  for (const [name, message] of Object.entries(manualComponents)) {
    if (!registry[name]) registry[name] = manual(message);
  }

  for (const name of layoutComponents) {
    registry[name] = deferred();
  }

  return registry;
}
