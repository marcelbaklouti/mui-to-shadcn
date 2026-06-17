import { test } from "node:test";
import assert from "node:assert/strict";
import { Project } from "ts-morph";
import { runMigration } from "../src/run.js";

function migrate(source: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("Test.tsx", source);
  return runMigration(file);
}

test("Button contained + error becomes destructive", () => {
  const result = migrate(
    'import { Button } from "@mui/material";\nexport const A = () => <Button variant="contained" color="error">X</Button>;\n',
  );
  assert.match(result.text, /<Button variant="destructive">X<\/Button>/);
  assert.match(result.text, /from "@\/components\/ui\/button"/);
  assert.doesNotMatch(result.text, /@mui\/material/);
});

test("Button outlined becomes outline, text becomes ghost, fullWidth becomes w-full", () => {
  const outlined = migrate(
    'import { Button } from "@mui/material";\nexport const A = () => <Button variant="outlined">X</Button>;\n',
  );
  assert.match(outlined.text, /<Button variant="outline">/);

  const text = migrate(
    'import { Button } from "@mui/material";\nexport const A = () => <Button variant="text" fullWidth>X</Button>;\n',
  );
  assert.match(text.text, /variant="ghost"/);
  assert.match(text.text, /className="w-full"/);
});

test("Button contained + primary gets no variant", () => {
  const result = migrate(
    'import { Button } from "@mui/material";\nexport const A = () => <Button variant="contained" color="primary">X</Button>;\n',
  );
  assert.match(result.text, /<Button>X<\/Button>/);
});

test("Checkbox onChange becomes onCheckedChange with a warning", () => {
  const result = migrate(
    'import { Checkbox } from "@mui/material";\nexport const A = () => <Checkbox checked={v} onChange={fn} color="primary" />;\n',
  );
  assert.match(result.text, /onCheckedChange=\{fn\}/);
  assert.doesNotMatch(result.text, /onChange/);
  assert.doesNotMatch(result.text, /color=/);
  assert.ok(result.warnings.some((warning) => warning.includes("onCheckedChange")));
});

test("Avatar is split into AvatarImage and AvatarFallback", () => {
  const result = migrate(
    'import { Avatar } from "@mui/material";\nexport const A = () => <Avatar src="/u.png" alt="N">MB</Avatar>;\n',
  );
  assert.match(result.text, /<AvatarImage src="\/u.png" alt="N" \/>/);
  assert.match(result.text, /<AvatarFallback>MB<\/AvatarFallback>/);
  assert.match(result.text, /from "@\/components\/ui\/avatar"/);
});

test("Card group converts CardActions to CardFooter with a merged import", () => {
  const result = migrate(
    'import { Card, CardContent, CardActions } from "@mui/material";\nexport const A = () => <Card><CardContent>a</CardContent><CardActions>b</CardActions></Card>;\n',
  );
  assert.match(result.text, /<CardFooter>b<\/CardFooter>/);
  assert.match(result.text, /<CardContent>a<\/CardContent>/);
  assert.match(result.text, /import \{ Card, CardContent, CardFooter \} from "@\/components\/ui\/card"/);
});

test("MUI import is removed and a shadcn import is inserted", () => {
  const result = migrate(
    'import { Button } from "@mui/material";\nexport const A = () => <Button>x</Button>;\n',
  );
  assert.doesNotMatch(result.text, /@mui\/material/);
  assert.match(result.text, /^import \{ Button \} from "@\/components\/ui\/button";/m);
});

test("sx is converted to Tailwind classes", () => {
  const result = migrate(
    'import { Card } from "@mui/material";\nexport const A = () => <Card sx={{ p: 1 }}>x</Card>;\n',
  );
  assert.match(result.text, /<Card className="p-2">x<\/Card>/);
  assert.doesNotMatch(result.text, /sx=/);
});

test("TextField becomes Label and Input", () => {
  const result = migrate(
    'import { TextField } from "@mui/material";\nexport const A = () => <TextField label="Name" value="" />;\n',
  );
  assert.match(result.text, /<Label htmlFor="name">Name<\/Label>/);
  assert.match(result.text, /<Input id="name" value="" \/>/);
  assert.match(result.text, /from "@\/components\/ui\/input"/);
  assert.doesNotMatch(result.text, /@mui\/material/);
});

test("TextField multiline becomes Textarea", () => {
  const result = migrate(
    'import { TextField } from "@mui/material";\nexport const A = () => <TextField label="Bio" multiline helperText="Kurz" />;\n',
  );
  assert.match(result.text, /<Textarea id="bio" \/>/);
  assert.match(result.text, /<p className="text-sm text-muted-foreground">Kurz<\/p>/);
});

test("Tooltip becomes TooltipProvider and converts the nested element", () => {
  const result = migrate(
    'import { Tooltip, Button } from "@mui/material";\nexport const A = () => <Tooltip title="t" placement="bottom"><Button variant="contained" color="error">x</Button></Tooltip>;\n',
  );
  assert.match(result.text, /<TooltipProvider>/);
  assert.match(result.text, /<TooltipTrigger asChild>/);
  assert.match(result.text, /<TooltipContent side="bottom">t<\/TooltipContent>/);
  assert.match(result.text, /<Button variant="destructive">x<\/Button>/);
  assert.doesNotMatch(result.text, /@mui\/material/);
});

test("Typography variant becomes a tag with classes", () => {
  const result = migrate(
    'import { Typography } from "@mui/material";\nexport const A = () => <Typography variant="h4" gutterBottom>T</Typography>;\n',
  );
  assert.match(result.text, /<h4 className="[^"]*mb-3[^"]*">T<\/h4>/);
});

test("Chip becomes Badge with a variant", () => {
  const result = migrate(
    'import { Chip } from "@mui/material";\nexport const A = () => <Chip label="N" color="error" variant="outlined" />;\n',
  );
  assert.match(result.text, /<Badge variant="outline">N<\/Badge>/);
  assert.match(result.text, /from "@\/components\/ui\/badge"/);
});

test("Skeleton dimensions become arbitrary classes", () => {
  const result = migrate(
    'import { Skeleton } from "@mui/material";\nexport const A = () => <Skeleton variant="rectangular" width={210} height={118} />;\n',
  );
  assert.match(result.text, /className="rounded-none w-\[210px\] h-\[118px\]"/);
});

test("Divider becomes Separator, IconButton becomes Button with size icon", () => {
  const divider = migrate(
    'import { Divider } from "@mui/material";\nexport const A = () => <Divider />;\n',
  );
  assert.match(divider.text, /<Separator \/>/);
  assert.match(divider.text, /from "@\/components\/ui\/separator"/);

  const iconButton = migrate(
    'import { IconButton } from "@mui/material";\nexport const A = () => <IconButton color="primary" size="small">X</IconButton>;\n',
  );
  assert.match(iconButton.text, /<Button variant="ghost" size="icon">X<\/Button>/);
});

test("Select becomes Select with Trigger and Content, MenuItem becomes SelectItem", () => {
  const result = migrate(
    'import { Select, MenuItem } from "@mui/material";\nexport const A = () => (\n  <Select value={v} onChange={h} label="Land">\n    <MenuItem value="de">DE</MenuItem>\n    <MenuItem value="at">AT</MenuItem>\n  </Select>\n);\n',
  );
  assert.match(result.text, /<SelectTrigger>/);
  assert.match(result.text, /<SelectValue placeholder="Land" \/>/);
  assert.match(result.text, /onValueChange=\{h\}/);
  assert.match(result.text, /<SelectItem value="de">DE<\/SelectItem>/);
  assert.match(result.text, /<SelectContent>/);
  assert.doesNotMatch(result.text, /@mui\/material/);
});

test("Accordion becomes Accordion with Item, Trigger and Content", () => {
  const result = migrate(
    'import { Accordion, AccordionSummary, AccordionDetails } from "@mui/material";\nexport const A = () => (\n  <Accordion>\n    <AccordionSummary>Titel</AccordionSummary>\n    <AccordionDetails>Inhalt</AccordionDetails>\n  </Accordion>\n);\n',
  );
  assert.match(result.text, /<Accordion type="single" collapsible>/);
  assert.match(result.text, /<AccordionItem value="item-1">/);
  assert.match(result.text, /<AccordionTrigger>Titel<\/AccordionTrigger>/);
  assert.match(result.text, /<AccordionContent>Inhalt<\/AccordionContent>/);
});

test("Tabs becomes Tabs with TabsList and TabsTrigger", () => {
  const result = migrate(
    'import { Tabs, Tab } from "@mui/material";\nexport const A = () => (\n  <Tabs value={v} onChange={h}>\n    <Tab label="Eins" value="one" />\n    <Tab label="Zwei" value="two" />\n  </Tabs>\n);\n',
  );
  assert.match(result.text, /<Tabs value=\{v\} onValueChange=\{h\}>/);
  assert.match(result.text, /<TabsList>/);
  assert.match(result.text, /<TabsTrigger value="one">Eins<\/TabsTrigger>/);
});

test("RadioGroup becomes RadioGroup with RadioGroupItem and Label", () => {
  const result = migrate(
    'import { RadioGroup, FormControlLabel, Radio } from "@mui/material";\nexport const A = () => (\n  <RadioGroup value={v} onChange={h}>\n    <FormControlLabel value="a" control={<Radio />} label="A" />\n  </RadioGroup>\n);\n',
  );
  assert.match(result.text, /<RadioGroup value=\{v\} onValueChange=\{h\}>/);
  assert.match(result.text, /<RadioGroupItem value="a" id="a" \/>/);
  assert.match(result.text, /<Label htmlFor="a">A<\/Label>/);
  assert.doesNotMatch(result.text, /@mui\/material/);
});

test("Dialog is converted structurally", () => {
  const result = migrate(
    'import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from "@mui/material";\nexport const A = () => (\n  <Dialog open={open} onClose={onClose}>\n    <DialogTitle>Titel</DialogTitle>\n    <DialogContent>\n      <DialogContentText>Beschreibung</DialogContentText>\n    </DialogContent>\n    <DialogActions>\n      <Button variant="contained">OK</Button>\n    </DialogActions>\n  </Dialog>\n);\n',
  );
  assert.match(result.text, /<Dialog open=\{open\} onOpenChange=\{onClose\}>/);
  assert.match(result.text, /<DialogContent>/);
  assert.match(result.text, /<DialogTitle>Titel<\/DialogTitle>/);
  assert.match(result.text, /<DialogDescription>Beschreibung<\/DialogDescription>/);
  assert.match(result.text, /<DialogFooter>/);
  assert.match(result.text, /<Button>OK<\/Button>/);
});

test("ToggleButtonGroup becomes ToggleGroup with items", () => {
  const result = migrate(
    'import { ToggleButtonGroup, ToggleButton } from "@mui/material";\nexport const A = () => (\n  <ToggleButtonGroup value={v} exclusive onChange={h}>\n    <ToggleButton value="left">L</ToggleButton>\n  </ToggleButtonGroup>\n);\n',
  );
  assert.match(result.text, /<ToggleGroup type="single" value=\{v\} onValueChange=\{h\}>/);
  assert.match(result.text, /<ToggleGroupItem value="left">L<\/ToggleGroupItem>/);
});

test("Drawer becomes Sheet with SheetContent", () => {
  const result = migrate(
    'import { Drawer } from "@mui/material";\nexport const A = () => (\n  <Drawer anchor="right" open={open} onClose={onClose}>Inhalt</Drawer>\n);\n',
  );
  assert.match(result.text, /<Sheet open=\{open\} onOpenChange=\{onClose\}>/);
  assert.match(result.text, /<SheetContent side="right">/);
});

test("Breadcrumbs becomes Breadcrumb with items and separators", () => {
  const result = migrate(
    'import { Breadcrumbs, Link, Typography } from "@mui/material";\nexport const A = () => (\n  <Breadcrumbs>\n    <Link href="/">Home</Link>\n    <Typography>Aktuell</Typography>\n  </Breadcrumbs>\n);\n',
  );
  assert.match(result.text, /<BreadcrumbList>/);
  assert.match(result.text, /<BreadcrumbLink href="\/">Home<\/BreadcrumbLink>/);
  assert.match(result.text, /<BreadcrumbPage>Aktuell<\/BreadcrumbPage>/);
  assert.match(result.text, /<BreadcrumbSeparator \/>/);
});

test("Table family converts header cells to TableHead", () => {
  const result = migrate(
    'import { Table, TableHead, TableBody, TableRow, TableCell } from "@mui/material";\nexport const A = () => (\n  <Table>\n    <TableHead>\n      <TableRow><TableCell>Name</TableCell></TableRow>\n    </TableHead>\n    <TableBody>\n      <TableRow><TableCell>Wert</TableCell></TableRow>\n    </TableBody>\n  </Table>\n);\n',
  );
  assert.match(result.text, /<TableHeader>/);
  assert.match(result.text, /<TableRow><TableHead>Name<\/TableHead><\/TableRow>/);
  assert.match(result.text, /<TableBody>/);
  assert.match(result.text, /<TableRow><TableCell>Wert<\/TableCell><\/TableRow>/);
  assert.doesNotMatch(result.text, /@mui\/material/);
});

test("Slider gets onValueChange and an array warning", () => {
  const result = migrate(
    'import { Slider } from "@mui/material";\nexport const A = () => <Slider value={val} onChange={h} marks />;\n',
  );
  assert.match(result.text, /onValueChange=\{h\}/);
  assert.doesNotMatch(result.text, /marks/);
  assert.ok(result.warnings.some((warning) => warning.includes("array")));
});

test("CircularProgress becomes Loader2 with animate-spin", () => {
  const result = migrate(
    'import { CircularProgress } from "@mui/material";\nexport const A = () => <CircularProgress size={24} />;\n',
  );
  assert.match(result.text, /<Loader2 className="size-6 animate-spin" \/>/);
  assert.match(result.text, /from "lucide-react"/);
  assert.doesNotMatch(result.text, /@mui\/material/);
});

test("Base UI: Tooltip without asChild and runMigration returns required components", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(
    "Base.tsx",
    'import { Tooltip, Button } from "@mui/material";\nexport const A = () => <Tooltip title="t"><Button>x</Button></Tooltip>;\n',
  );
  const result = runMigration(file, { base: "base" });
  assert.match(result.text, /<TooltipTrigger>/);
  assert.doesNotMatch(result.text, /asChild/);
  assert.ok(result.components.includes("tooltip"));
  assert.ok(result.components.includes("button"));
});

test("radix stays the default with asChild", () => {
  const result = migrate(
    'import { Tooltip, Button } from "@mui/material";\nexport const A = () => <Tooltip title="t"><Button>x</Button></Tooltip>;\n',
  );
  assert.match(result.text, /<TooltipTrigger asChild>/);
});

test("Menu becomes DropdownMenu, MenuItem becomes DropdownMenuItem", () => {
  const result = migrate(
    'import { Menu, MenuItem, Divider } from "@mui/material";\nexport const A = () => (\n  <Menu anchorEl={el} open={open} onClose={close}>\n    <MenuItem onClick={close}>Profil</MenuItem>\n    <Divider />\n    <MenuItem onClick={close}>Abmelden</MenuItem>\n  </Menu>\n);\n',
  );
  assert.match(result.text, /<DropdownMenu open=\{open\} onOpenChange=\{close\}>/);
  assert.match(result.text, /<DropdownMenuTrigger>Menu<\/DropdownMenuTrigger>/);
  assert.match(result.text, /<DropdownMenuContent>/);
  assert.match(result.text, /<DropdownMenuItem onClick=\{close\}>Profil<\/DropdownMenuItem>/);
  assert.match(result.text, /<DropdownMenuSeparator \/>/);
  assert.doesNotMatch(result.text, /@mui\/material/);
});

test("Popover becomes Popover with Trigger and Content", () => {
  const result = migrate(
    'import { Popover } from "@mui/material";\nexport const A = () => (\n  <Popover open={open} anchorEl={el} onClose={close}>Inhalt</Popover>\n);\n',
  );
  assert.match(result.text, /<Popover open=\{open\} onOpenChange=\{close\}>/);
  assert.match(result.text, /<PopoverTrigger>Open<\/PopoverTrigger>/);
  assert.match(result.text, /<PopoverContent>/);
  assert.doesNotMatch(result.text, /anchorEl/);
});

test("Modal becomes Dialog with DialogContent", () => {
  const result = migrate(
    'import { Modal } from "@mui/material";\nexport const A = () => <Modal open={open} onClose={close}><div>x</div></Modal>;\n',
  );
  assert.match(result.text, /<Dialog open=\{open\} onOpenChange=\{close\}>/);
  assert.match(result.text, /<DialogContent>/);
});

test("Collapse becomes Collapsible", () => {
  const result = migrate(
    'import { Collapse } from "@mui/material";\nexport const A = () => <Collapse in={open}>Inhalt</Collapse>;\n',
  );
  assert.match(result.text, /<Collapsible open=\{open\}>/);
  assert.match(result.text, /<CollapsibleContent>/);
});

test("List family becomes semantic HTML", () => {
  const result = migrate(
    'import { List, ListItem, ListItemText } from "@mui/material";\nexport const A = () => (\n  <List>\n    <ListItem>\n      <ListItemText primary="Titel" secondary="Unter" />\n    </ListItem>\n  </List>\n);\n',
  );
  assert.match(result.text, /<ul>/);
  assert.match(result.text, /<li className="flex items-center">/);
  assert.match(result.text, /<span>Titel<\/span>/);
  assert.match(result.text, /<span className="text-sm text-muted-foreground">Unter<\/span>/);
  assert.doesNotMatch(result.text, /@mui\/material/);
});

test("ListItemButton becomes Button variant ghost", () => {
  const result = migrate(
    'import { ListItemButton } from "@mui/material";\nexport const A = () => <ListItemButton onClick={go}>Eintrag</ListItemButton>;\n',
  );
  assert.match(result.text, /<Button variant="ghost" onClick=\{go\} className="w-full justify-start">Eintrag<\/Button>/);
});

test("Input variants become Input", () => {
  const result = migrate(
    'import { OutlinedInput } from "@mui/material";\nexport const A = () => <OutlinedInput value={v} fullWidth />;\n',
  );
  assert.match(result.text, /<Input value=\{v\} className="w-full" \/>/);
  assert.match(result.text, /from "@\/components\/ui\/input"/);
});

test("Fab becomes Button with rounded-full", () => {
  const result = migrate(
    'import { Fab } from "@mui/material";\nexport const A = () => <Fab color="primary" onClick={go}>+</Fab>;\n',
  );
  assert.match(result.text, /<Button onClick=\{go\} className="rounded-full size-14">\+<\/Button>/);
});

test("FormHelperText becomes p with muted-foreground", () => {
  const result = migrate(
    'import { FormHelperText } from "@mui/material";\nexport const A = () => <FormHelperText>Hinweis</FormHelperText>;\n',
  );
  assert.match(result.text, /<p className="text-sm text-muted-foreground">Hinweis<\/p>/);
});

test("ClickAwayListener is removed, content remains", () => {
  const result = migrate(
    'import { ClickAwayListener } from "@mui/material";\nexport const A = () => <ClickAwayListener onClickAway={fn}><div>x</div></ClickAwayListener>;\n',
  );
  assert.match(result.text, /<div>x<\/div>/);
  assert.doesNotMatch(result.text, /ClickAwayListener/);
  assert.doesNotMatch(result.text, /@mui\/material/);
});

test("Badge becomes a positioned shadcn Badge over the child", () => {
  const result = migrate(
    'import { Badge } from "@mui/material";\nexport const A = () => <Badge badgeContent={4} color="error"><Icon /></Badge>;\n',
  );
  assert.match(result.text, /<span className="relative inline-flex">/);
  assert.match(result.text, /<Icon \/>/);
  assert.match(result.text, /<Badge variant="destructive" className="absolute -right-2 -top-2">\{4\}<\/Badge>/);
  assert.match(result.text, /from "@\/components\/ui\/badge"/);
});

test("Pagination becomes static shadcn Pagination markup", () => {
  const result = migrate(
    'import { Pagination } from "@mui/material";\nexport const A = () => <Pagination count={10} page={page} onChange={go} />;\n',
  );
  assert.match(result.text, /<PaginationContent>/);
  assert.match(result.text, /<PaginationPrevious href="#" \/>/);
  assert.match(result.text, /<PaginationNext href="#" \/>/);
  assert.ok(result.warnings.some((warning) => warning.includes("count")));
});

test("Snackbar with a child is unwrapped", () => {
  const result = migrate(
    'import { Snackbar, Alert } from "@mui/material";\nexport const A = () => (\n  <Snackbar open={open} onClose={close}>\n    <Alert severity="success">Gespeichert</Alert>\n  </Snackbar>\n);\n',
  );
  assert.match(result.text, /<Alert>/);
  assert.doesNotMatch(result.text, /Snackbar/);
  assert.ok(result.warnings.some((warning) => warning.toLowerCase().includes("toast")));
});

test("TabContext family becomes shadcn Tabs", () => {
  const result = migrate(
    'import { Tab } from "@mui/material";\nimport { TabContext, TabList, TabPanel } from "@mui/lab";\nexport const A = () => (\n  <TabContext value={value}>\n    <TabList onChange={handle}>\n      <Tab label="Eins" value="1" />\n      <Tab label="Zwei" value="2" />\n    </TabList>\n    <TabPanel value="1">Panel Eins</TabPanel>\n    <TabPanel value="2">Panel Zwei</TabPanel>\n  </TabContext>\n);\n',
  );
  assert.match(result.text, /<Tabs value=\{value\} onValueChange=\{handle\}>/);
  assert.match(result.text, /<TabsList>/);
  assert.match(result.text, /<TabsTrigger value="1">Eins<\/TabsTrigger>/);
  assert.match(result.text, /<TabsContent value="1">Panel Eins<\/TabsContent>/);
  assert.doesNotMatch(result.text, /@mui\/lab/);
  assert.doesNotMatch(result.text, /@mui\/material/);
});

test("Stepper family becomes semantic markup", () => {
  const result = migrate(
    'import { Stepper, Step, StepLabel } from "@mui/material";\nexport const A = () => (\n  <Stepper activeStep={1}>\n    <Step>\n      <StepLabel>Konto</StepLabel>\n    </Step>\n    <Step>\n      <StepLabel>Adresse</StepLabel>\n    </Step>\n  </Stepper>\n);\n',
  );
  assert.match(result.text, /<ol className="flex flex-wrap items-center gap-4">/);
  assert.match(result.text, /<li className="flex items-center gap-2">/);
  assert.match(result.text, /<span className="text-sm font-medium">Konto<\/span>/);
  assert.doesNotMatch(result.text, /activeStep/);
  assert.doesNotMatch(result.text, /@mui\/material/);
});

test("Rating becomes a row of Star icons", () => {
  const result = migrate(
    'import { Rating } from "@mui/material";\nexport const A = () => <Rating value={value} max={5} />;\n',
  );
  const stars = result.text.match(/<Star className="size-5" \/>/g) ?? [];
  assert.equal(stars.length, 5);
  assert.match(result.text, /<div className="flex items-center gap-0.5">/);
  assert.match(result.text, /from "lucide-react"/);
});

test("Fade transition is unwrapped, content remains", () => {
  const result = migrate(
    'import { Fade } from "@mui/material";\nexport const A = () => <Fade in={show}><div>Inhalt</div></Fade>;\n',
  );
  assert.match(result.text, /<div>Inhalt<\/div>/);
  assert.doesNotMatch(result.text, /Fade/);
  assert.doesNotMatch(result.text, /@mui\/material/);
  assert.ok(result.warnings.some((warning) => warning.includes("tw-animate-css")));
});

test("Base UI Select warns about items and nativeButton, radix does not", () => {
  const src =
    'import { Select, MenuItem } from "@mui/material";\nexport const A = () => <Select value={v}><MenuItem value="a">A</MenuItem></Select>;\n';
  const project = new Project({ useInMemoryFileSystem: true });
  const base = runMigration(project.createSourceFile("Base.tsx", src), { base: "base" });
  const radix = runMigration(project.createSourceFile("Radix.tsx", src), { base: "radix" });
  assert.ok(base.warnings.some((warning) => warning.includes("items prop")));
  assert.ok(!radix.warnings.some((warning) => warning.includes("items prop")));
});

test("Button startIcon moves into children and converts via the icon pass", () => {
  const result = migrate(
    'import { Button } from "@mui/material";\nimport SaveIcon from "@mui/icons-material/Save";\nexport const A = () => <Button variant="contained" startIcon={<SaveIcon />}>Save</Button>;\n',
  );
  assert.match(result.text, /<Button><Save \/> Save<\/Button>/);
  assert.match(result.text, /import \{ Save \} from "lucide-react"/);
  assert.doesNotMatch(result.text, /startIcon/);
});

test("Button href becomes asChild with an anchor", () => {
  const result = migrate(
    'import { Button } from "@mui/material";\nexport const A = () => <Button href="/home" variant="contained">Home</Button>;\n',
  );
  assert.match(result.text, /<Button asChild><a href="\/home">Home<\/a><\/Button>/);
});
