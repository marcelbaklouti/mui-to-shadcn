# Component support

> Auto-generated from the registry (`src/mappings.ts`). Regenerate with `npm run docs`.

Catalogued: 115 MUI components. Full: 99, in parent: 7, partial: 4, manual: 5.

Plus `@mui/icons-material` → `lucide-react` (~700 icon names mapped) and MUI theme/Emotion infrastructure removal (`ThemeProvider`, `CssBaseline`, cache providers).

Legend: **Full** = structurally fully converted. **In parent** = converted automatically when nested in the matching container. **Partial** = converted but needs follow-up. **Manual** = left in place (no equivalent, or a fundamentally different one), with a note.

## Fully converted

| MUI | shadcn/ui | Note |
| --- | --- | --- |
| Accordion | Accordion + Item/Trigger/Content | - |
| Alert | Alert | - |
| AlertTitle | AlertTitle | - |
| AppBar | header | - |
| Avatar | Avatar + AvatarImage/AvatarFallback | - |
| Backdrop | div | - |
| Badge | span + Badge (positioned) | positioned overlay over the child |
| BottomNavigation | nav | - |
| Box | div | in the sx / system-props pass |
| Breadcrumbs | Breadcrumb + List/Item/Link/Page | - |
| Button | - | - |
| ButtonBase | button | native button (unstyled); add styling or use Button |
| Card | Card | - |
| CardActionArea | button | - |
| CardActions | CardFooter | - |
| CardContent | CardContent | - |
| CardHeader | CardHeader + CardTitle/CardDescription | - |
| CardMedia | img | - |
| Checkbox | Checkbox | onChange becomes onCheckedChange (boolean) |
| Chip | Badge | MUI Badge is separate (counter) and stays manual |
| CircularProgress | Loader2 (lucide spinner) | spinner shows no determinate progress |
| ClickAwayListener | (unwrapped) | removed; content preserved |
| Collapse | Collapsible + CollapsibleContent | add a CollapsibleTrigger; in becomes open |
| Container | div (mx-auto, max-width) | in the sx / system-props pass |
| Dialog | Dialog + Content/Title/Description/Footer | add DialogHeader manually; onClose becomes onOpenChange |
| DialogActions | DialogFooter | - |
| DialogContent | DialogContent | - |
| DialogContentText | DialogDescription | - |
| DialogTitle | DialogTitle | - |
| Divider | Separator | - |
| Drawer | Sheet + SheetContent | add SheetTrigger if needed; onClose becomes onOpenChange |
| Fab | Button | - |
| Fade | (unwrapped) | unwrapped; recreate animation with tw-animate-css |
| FilledInput | Input | - |
| FormControl | div | - |
| FormControlLabel | div + control + Label | the control (Checkbox/Switch/Radio) is converted inline |
| FormGroup | div | - |
| FormHelperText | p | - |
| FormLabel | Label | - |
| Grow | (unwrapped) | unwrapped; recreate animation with tw-animate-css |
| IconButton | Button | becomes Button variant ghost, size icon |
| ImageList | div | - |
| ImageListItem | div | - |
| Input | Input | - |
| InputAdornment | span | - |
| InputBase | Input | - |
| InputLabel | Label | - |
| LinearProgress | Progress | - |
| Link | a | becomes a native a element |
| List | ul | - |
| ListItem | li | - |
| ListItemAvatar | span | - |
| ListItemButton | Button | - |
| ListItemIcon | span | - |
| ListItemSecondaryAction | span | - |
| ListItemText | div + span | - |
| ListSubheader | li | - |
| Menu | DropdownMenu + Trigger/Content/Item | anchorEl dropped; replace the trigger element |
| MenuItem | SelectItem | - |
| MenuList | DropdownMenu + Trigger/Content/Item | anchorEl dropped; replace the trigger element |
| Modal | Dialog + DialogContent | add DialogTrigger/DialogHeader if needed; onClose becomes onOpenChange |
| NativeSelect | select | - |
| OutlinedInput | Input | - |
| Pagination | Pagination (static markup) | static markup; render pages from count |
| Paper | div | elevation becomes shadow; square becomes rounded-none |
| Popover | Popover + Trigger/Content | anchorEl dropped; replace the trigger; onClose becomes onOpenChange |
| Popper | Popover + Trigger/Content | anchorEl dropped; replace the trigger; onClose becomes onOpenChange |
| Portal | (unwrapped) | removed; content preserved |
| RadioGroup | RadioGroup + RadioGroupItem | - |
| Rating | Star row (lucide) | wire up value/interaction manually |
| Select | Select + Trigger/Content/Item | onChange becomes onValueChange (value string) |
| Skeleton | Skeleton | - |
| Slide | (unwrapped) | unwrapped; recreate animation with tw-animate-css |
| Snackbar | sonner (toast) | imperative; use sonner and add a <Toaster /> |
| Stack | div (flex, gap from spacing) | in the sx / system-props pass |
| Step | li | - |
| StepContent | div | - |
| StepLabel | span | - |
| Stepper | ol | - |
| SwipeableDrawer | Sheet + SheetContent | add SheetTrigger if needed; onClose becomes onOpenChange |
| Switch | Switch | onChange becomes onCheckedChange (boolean) |
| TabContext | Tabs + List/Trigger/Content | MUI Lab; panels become TabsContent |
| Table | Table | - |
| TableBody | TableBody | - |
| TableCell | TableCell | - |
| TableContainer | div | - |
| TableFooter | TableFooter | - |
| TableHead | TableHeader (+ TableHead cells) | - |
| TableRow | TableRow | - |
| TableSortLabel | button + sort icon | active/direction dropped; wire sorting manually |
| Tabs | Tabs + TabsList/TabsTrigger | panels live outside Tabs in MUI; add TabsContent |
| TextareaAutosize | Textarea | - |
| TextField | Label + Input/Textarea | - |
| Timeline | ul + li/div/span (semantic) | best-effort semantic markup; review the layout |
| ToggleButtonGroup | ToggleGroup + ToggleGroupItem | - |
| Toolbar | div | - |
| Tooltip | Tooltip + Provider/Trigger/Content | Base UI: replace asChild with the render prop |
| Typography | h1-h4 / p (per variant) | - |
| Zoom | (unwrapped) | unwrapped; recreate animation with tw-animate-css |

## Converted inside the parent

| MUI | shadcn/ui | Note |
| --- | --- | --- |
| AccordionDetails | AccordionContent (in Accordion) | only inside its parent |
| AccordionSummary | AccordionTrigger (in Accordion) | only inside its parent |
| Radio | RadioGroupItem (in RadioGroup) | only inside its parent |
| Tab | TabsTrigger (in Tabs) | only inside its parent |
| TabList | TabsList (in TabContext) | only inside its parent |
| TabPanel | TabsContent (in TabContext) | only inside its parent |
| ToggleButton | ToggleGroupItem (in ToggleButtonGroup) | only inside its parent |

## Partial (needs follow-up)

| MUI | shadcn/ui | Note |
| --- | --- | --- |
| Grid | div (grid grid-cols-12 + col-span) | real CSS grid; size="grow"/"auto" are flagged |
| Grid2 | div (grid grid-cols-12 + col-span) | real CSS grid; size="grow"/"auto" are flagged |
| GridLegacy | div (grid grid-cols-12 + col-span) | real CSS grid; size="grow"/"auto" are flagged |
| Slider | Slider | value/defaultValue must be an array; onChange becomes onValueChange |

## Manual (no or different equivalent)

| MUI | Note |
| --- | --- |
| Autocomplete | Autocomplete -> shadcn Combobox (Popover + Command + Button); needs useState/open state, so build it manually (shadcn add command popover button) |
| BottomNavigationAction | BottomNavigationAction has no equivalent; use a Link/Button in the navigation bar |
| DataGrid | DataGrid -> shadcn Table + @tanstack/react-table (Data Table recipe); needs columns/hooks, so build it manually (shadcn add table; npm i @tanstack/react-table) |
| SpeedDial | SpeedDial has no equivalent; use DropdownMenu or custom floating actions |
| TablePagination | TablePagination -> shadcn Pagination + rows-per-page state; build it manually (shadcn add pagination select) |
