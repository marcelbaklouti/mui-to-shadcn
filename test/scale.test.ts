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
