import { test } from "node:test";
import assert from "node:assert/strict";
import { Project } from "ts-morph";
import { runMigration } from "../src/run.js";

function migrate(source: string, name = "Test.tsx") {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(name, source);
  return runMigration(file);
}

// ---- v4 (@material-ui/*) support ----

test("v4 @material-ui/core components convert like v5", () => {
  const result = migrate(
    'import { Button, TextField } from "@material-ui/core";\n' +
      'export const A = () => (<><Button variant="contained">X</Button><TextField label="Name" /></>);\n',
  );
  assert.match(result.text, /from "@\/components\/ui\/button"/);
  assert.match(result.text, /from "@\/components\/ui\/input"/);
  assert.doesNotMatch(result.text, /@material-ui\/core/);
});

test("v4 @material-ui/icons deep import converts to lucide-react", () => {
  const result = migrate(
    'import AddIcon from "@material-ui/icons/Add";\nexport const A = () => <AddIcon />;\n',
  );
  assert.match(result.text, /import \{ Plus \} from "lucide-react"/);
  assert.match(result.text, /<Plus \/>/);
  assert.doesNotMatch(result.text, /@material-ui\/icons/);
});

test("v4 MuiThemeProvider is unwrapped and createMuiTheme is flagged", () => {
  const result = migrate(
    'import { Button, MuiThemeProvider, createMuiTheme } from "@material-ui/core";\n' +
      "const theme = createMuiTheme({});\n" +
      "export const A = () => (<MuiThemeProvider theme={theme}><Button>X</Button></MuiThemeProvider>);\n",
  );
  assert.doesNotMatch(result.text, /MuiThemeProvider/);
  assert.match(result.text, /<Button[^>]*>X<\/Button>/);
  assert.ok(
    result.warnings.some((w) => w.includes("createMuiTheme")),
    "expected a createMuiTheme warning",
  );
});

// ---- @mui/system support ----

test("@mui/system Box and Stack convert to div with flex classes and the import is removed", () => {
  const result = migrate(
    'import { Box, Stack } from "@mui/system";\n' +
      'export const A = () => <Box sx={{ p: 2 }}><Stack spacing={2} direction="row">x</Stack></Box>;\n',
  );
  assert.match(result.text, /<div className="p-4">/);
  assert.match(result.text, /flex gap-4 flex-row/);
  assert.doesNotMatch(result.text, /@mui\/system/);
});

// ---- container closing tags & spread preservation ----

test("ToggleButtonGroup rewrites the closing tag (not left as </ToggleButtonGroup>)", () => {
  const result = migrate(
    'import { ToggleButtonGroup, ToggleButton } from "@mui/material";\n' +
      'export const A = ({ v, h }: any) => (<ToggleButtonGroup value={v} exclusive onChange={h}><ToggleButton value="a">A</ToggleButton></ToggleButtonGroup>);\n',
  );
  assert.match(result.text, /<\/ToggleGroup>/);
  assert.doesNotMatch(result.text, /<\/ToggleButtonGroup>/);
});

test("an aliased RadioGroup rewrites its closing tag", () => {
  const result = migrate(
    'import { RadioGroup as MuiRadioGroup, FormControlLabel, Radio } from "@mui/material";\n' +
      'export const A = ({ v, h }: any) => (<MuiRadioGroup value={v} onChange={h}><FormControlLabel value="x" control={<Radio />} label="X" /></MuiRadioGroup>);\n',
  );
  assert.match(result.text, /<\/RadioGroup>/);
  assert.doesNotMatch(result.text, /MuiRadioGroup/);
});

test("spread props are preserved on TextField (react-hook-form register)", () => {
  const result = migrate(
    'import { TextField } from "@mui/material";\n' +
      'export const A = ({ register }: any) => <TextField {...register("email")} label="Email" />;\n',
  );
  assert.match(result.text, /<Input[^>]*\{\.\.\.register\("email"\)\}/);
});

test("spread props are preserved on Select (react-hook-form field)", () => {
  const result = migrate(
    'import { Select, MenuItem } from "@mui/material";\n' +
      'export const A = ({ field }: any) => (<Select {...field}><MenuItem value="x">X</MenuItem></Select>);\n',
  );
  assert.match(result.text, /<Select \{\.\.\.field\}>/);
});

// ---- className/sx moved off Radix roots onto the content element ----

test("Dialog className moves to DialogContent, not the Radix root", () => {
  const result = migrate(
    'import { Dialog, DialogTitle } from "@mui/material";\n' +
      'export const A = ({ open }: any) => (<Dialog open={open} className="max-w-2xl"><DialogTitle>T</DialogTitle></Dialog>);\n',
  );
  assert.match(result.text, /<DialogContent className="max-w-2xl">/);
  assert.doesNotMatch(result.text, /<Dialog [^>]*className/);
});

test("Drawer sx width converts to a class on SheetContent, not the Sheet root", () => {
  const result = migrate(
    'import { Drawer } from "@mui/material";\n' +
      "export const A = ({ open }: any) => (<Drawer open={open} sx={{ width: 240 }}><nav>N</nav></Drawer>);\n",
  );
  assert.match(result.text, /<SheetContent side="left" className="w-\[240px\]">/);
  assert.doesNotMatch(result.text, /<Sheet [^>]*(className|sx)/);
});

test("Select sx moves to SelectTrigger, not the Radix root", () => {
  const result = migrate(
    'import { Select, MenuItem } from "@mui/material";\n' +
      'export const A = () => (<Select value="a" sx={{ minWidth: 180 }}><MenuItem value="a">A</MenuItem></Select>);\n',
  );
  assert.match(result.text, /<SelectTrigger className="min-w-\[180px\]">/);
  assert.doesNotMatch(result.text, /<Select [^>]*sx=/);
});

// ---- unconditional-render gating ----

test("Backdrop is gated on its open expression, not rendered unconditionally", () => {
  const result = migrate(
    'import { Backdrop, CircularProgress } from "@mui/material";\n' +
      "export const A = ({ loading }: any) => (<Backdrop open={loading}><CircularProgress /></Backdrop>);\n",
  );
  assert.match(result.text, /\{loading && \(<div className="[^"]*bg-black\/50"/);
  assert.match(result.text, /<\/div>\)\}/);
});

test("Backdrop preserves onClick (click-to-close)", () => {
  const result = migrate(
    'import { Backdrop } from "@mui/material";\n' +
      "export const A = ({ open, close }: any) => (<Backdrop open={open} onClick={close}>x</Backdrop>);\n",
  );
  assert.match(result.text, /onClick=\{close\}/);
});

test("Snackbar child is gated on open", () => {
  const result = migrate(
    'import { Snackbar, Alert } from "@mui/material";\n' +
      "export const A = ({ open }: any) => (<Snackbar open={open}><Alert>Saved</Alert></Snackbar>);\n",
  );
  assert.match(result.text, /\{open && \(/);
});

test("Fade/transition child is gated on the in condition", () => {
  const result = migrate(
    'import { Fade } from "@mui/material";\n' +
      "export const A = ({ show }: any) => (<Fade in={show}><div>c</div></Fade>);\n",
  );
  assert.match(result.text, /\{show && \(<div>c<\/div>\)\}/);
});

test("permanent Drawer becomes a static aside (not a closed Sheet)", () => {
  const result = migrate(
    'import { Drawer } from "@mui/material";\n' +
      'export const A = () => (<Drawer variant="permanent" anchor="left"><nav>Nav</nav></Drawer>);\n',
  );
  assert.match(result.text, /<aside className="[^"]*border-r[^"]*"><nav>Nav<\/nav><\/aside>/);
  assert.doesNotMatch(result.text, /Sheet/);
});

test("persistent Drawer becomes an aside gated on open", () => {
  const result = migrate(
    'import { Drawer } from "@mui/material";\n' +
      'export const A = ({ open }: any) => (<Drawer variant="persistent" open={open}><nav>P</nav></Drawer>);\n',
  );
  assert.match(result.text, /\{open && \(<aside/);
});

test("temporary Drawer still becomes a Sheet", () => {
  const result = migrate(
    'import { Drawer } from "@mui/material";\n' +
      "export const A = ({ open }: any) => (<Drawer open={open}><nav>T</nav></Drawer>);\n",
  );
  assert.match(result.text, /<Sheet/);
  assert.match(result.text, /<SheetContent side="left">/);
});

// ---- reference-safe import removal ----

test("a component used in styled() is left as MUI, not half-converted into a dangling reference", () => {
  const result = migrate(
    'import { Button } from "@mui/material";\n' +
      'import { styled } from "@mui/material/styles";\n' +
      "const Fancy = styled(Button)({ padding: 8 });\n" +
      'export const A = () => (<><Button variant="contained">x</Button><Fancy>y</Fancy></>);\n',
  );
  // Button import is kept (styled(Button) still resolves) and not removed.
  assert.match(result.text, /import \{ Button \} from "@mui\/material"/);
  assert.match(result.text, /styled\(Button\)/);
  assert.ok(result.residualMui.includes("@mui/material"));
  assert.ok(result.manual.some((m) => m.component === "Button"));
});

test("a component used in a value map is left as MUI (no undefined identifier)", () => {
  const result = migrate(
    'import { CircularProgress } from "@mui/material";\n' +
      "const map = { spinner: CircularProgress };\n" +
      "export const A = () => <CircularProgress />;\n",
  );
  assert.match(result.text, /import \{ CircularProgress \} from "@mui\/material"/);
  assert.match(result.text, /spinner: CircularProgress/);
  assert.doesNotMatch(result.text, /Loader2/);
});

test("a value reference on one component does not block converting others", () => {
  const result = migrate(
    'import { Button, TextField } from "@mui/material";\n' +
      'import { styled } from "@mui/material/styles";\n' +
      "const Fancy = styled(Button)({});\n" +
      'export const A = () => (<><Fancy>x</Fancy><TextField label="Name" /></>);\n',
  );
  assert.match(result.text, /from "@\/components\/ui\/input"/);
  assert.match(result.text, /import \{ Button \} from "@mui\/material"/);
});

test("a wrapper file whose shadcn name collides with a local declaration is left as MUI", () => {
  const result = migrate(
    'import { Button as MuiButton } from "@mui/material";\n' +
      "export function Button(props: any) {\n  return <MuiButton {...props} />;\n}\n",
  );
  // No duplicate `Button` import and no self-recursive wrapper.
  assert.doesNotMatch(result.text, /from "@\/components\/ui\/button"/);
  assert.match(result.text, /import \{ Button as MuiButton \} from "@mui\/material"/);
  assert.ok(result.manual.some((m) => m.component === "Button"));
});

// ---- end-of-run "still references MUI" safety net ----

test("a fully converted file reports no residual MUI", () => {
  const result = migrate(
    'import { Button } from "@mui/material";\nexport const A = () => <Button>X</Button>;\n',
  );
  assert.deepEqual(result.residualMui, []);
});

test("a namespace import is not (yet) converted but is surfaced as residual MUI, not silently skipped", () => {
  const result = migrate(
    'import * as MUI from "@mui/material";\nexport const A = () => <MUI.Button>X</MUI.Button>;\n',
  );
  assert.deepEqual(result.residualMui, ["@mui/material"]);
  assert.ok(
    result.warnings.some((w) => w.includes("still references @mui/material")),
    "expected a residual-MUI warning",
  );
});

// ---- sx emitter correctness ----

test("fractional sizing: numbers in (0,1] become percentages, not pixels", () => {
  const result = migrate(
    'import { Box } from "@mui/material";\n' +
      'export const A = () => <Box sx={{ width: 1, height: 0.5, maxWidth: 0.75 }}>x</Box>;\n',
  );
  assert.match(result.text, /w-full/);
  assert.match(result.text, /h-1\/2/);
  assert.match(result.text, /max-w-\[75%\]/);
  assert.doesNotMatch(result.text, /w-\[1px\]/);
});

test("arbitrary values with spaces are underscored into one valid class", () => {
  const result = migrate(
    'import { Box } from "@mui/material";\n' +
      'export const A = () => <Box sx={{ maxWidth: "calc(100% - 32px)", flex: "1 1 auto" }}>x</Box>;\n',
  );
  assert.match(result.text, /max-w-\[calc\(100%_-_32px\)\]/);
  assert.match(result.text, /flex-\[1_1_auto\]/);
  assert.doesNotMatch(result.text, /\[calc\(100% - 32px\)\]/);
});

test("numeric flex:1 maps to flex-1 instead of leftover sx", () => {
  const result = migrate(
    'import { Box } from "@mui/material";\nexport const A = () => <Box sx={{ flex: 1 }}>x</Box>;\n',
  );
  assert.match(result.text, /className="flex-1"/);
  assert.doesNotMatch(result.text, /sx=/);
});

test("non-object sx (callback/array/variable) is preserved verbatim, not deleted", () => {
  const callback = migrate(
    'import { Box } from "@mui/material";\n' +
      'export const A = () => <Box sx={(t) => ({ p: t.spacing(2) })}>x</Box>;\n',
  );
  assert.match(callback.text, /sx=\{\(t\) => \(\{ p: t\.spacing\(2\) \}\)\}/);

  const array = migrate(
    'import { Box } from "@mui/material";\n' +
      'export const A = ({ c }: { c: boolean }) => <Box sx={[{ p: 2 }, c && { mt: 1 }]}>x</Box>;\n',
  );
  assert.match(array.text, /sx=\{\[\{ p: 2 \}, c && \{ mt: 1 \}\]\}/);
});

test("responsive Stack direction/spacing objects map to breakpoint-prefixed classes", () => {
  const result = migrate(
    'import { Stack } from "@mui/material";\n' +
      'export const A = () => <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 1, md: 4 }}>x</Stack>;\n',
  );
  assert.match(result.text, /flex-col/);
  assert.match(result.text, /sm:flex-row/);
  assert.match(result.text, /gap-2/);
  assert.match(result.text, /md:gap-8/);
});

test("responsive Grid spacing/columns objects map to breakpoint-prefixed classes", () => {
  const result = migrate(
    'import { Grid } from "@mui/material";\n' +
      'export const A = () => <Grid container spacing={{ xs: 1, md: 3 }} columns={{ xs: 4, md: 12 }}>x</Grid>;\n',
  );
  assert.match(result.text, /grid-cols-4/);
  assert.match(result.text, /md:grid-cols-12/);
  assert.match(result.text, /gap-2/);
  assert.match(result.text, /md:gap-6/);
});

test("a dangling @mui type import is surfaced as residual MUI", () => {
  const result = migrate(
    'import { Button } from "@mui/material";\n' +
      'import type { ButtonProps } from "@mui/material";\n' +
      "export const A = (p: ButtonProps) => <Button {...p}>X</Button>;\n",
  );
  assert.match(result.text, /from "@\/components\/ui\/button"/);
  assert.ok(result.residualMui.includes("@mui/material"), "type import should keep @mui/material residual");
});
