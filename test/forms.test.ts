import { test } from "node:test";
import assert from "node:assert/strict";
import { Project } from "ts-morph";
import { runMigration } from "../src/run.js";

function migrate(source: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("Test.tsx", source);
  return runMigration(file);
}

test("TextField select becomes a Select composition, keeping the options", () => {
  const result = migrate(
    'import { TextField, MenuItem } from "@mui/material";\n' +
      "export const A = ({ age, setAge }: any) => (\n" +
      '  <TextField select value={age} onChange={(e) => setAge(e.target.value)} label="Age">\n' +
      '    <MenuItem value="10">Ten</MenuItem>\n' +
      '    <MenuItem value="20">Twenty</MenuItem>\n' +
      "  </TextField>\n);\n",
  );
  assert.match(result.text, /<Select value=\{age\} onValueChange=\{\(e\) => setAge\(e\)\}>/);
  assert.match(result.text, /<SelectValue placeholder="Age" \/>/);
  assert.match(result.text, /<SelectItem value="10">Ten<\/SelectItem>/);
  assert.match(result.text, /<SelectItem value="20">Twenty<\/SelectItem>/);
  assert.doesNotMatch(result.text, /<Input/);
});

test("plain TextField still becomes Label + Input", () => {
  const result = migrate(
    'import { TextField } from "@mui/material";\nexport const A = () => <TextField label="Name" />;\n',
  );
  assert.match(result.text, /<Input id="name"/);
  assert.match(result.text, /<Label htmlFor="name">Name<\/Label>/);
});

test("multiline TextField still becomes Textarea", () => {
  const result = migrate(
    'import { TextField } from "@mui/material";\nexport const A = () => <TextField multiline minRows={3} label="Bio" />;\n',
  );
  assert.match(result.text, /<Textarea id="bio" rows=\{3\}/);
});

test('MenuItem value="" is remapped to a "none" sentinel (Radix would crash on empty)', () => {
  const result = migrate(
    'import { Select, MenuItem } from "@mui/material";\n' +
      "export const A = ({ v, setV }: any) => (\n" +
      "  <Select value={v} onChange={(e) => setV(e.target.value)}>\n" +
      '    <MenuItem value=""><em>None</em></MenuItem>\n' +
      '    <MenuItem value="a">A</MenuItem>\n' +
      "  </Select>\n);\n",
  );
  assert.match(result.text, /<SelectItem value="none"><em>None<\/em><\/SelectItem>/);
  assert.doesNotMatch(result.text, /<SelectItem value="">/);
  assert.ok(result.warnings.some((w) => w.includes('value=""')));
});

test("standalone MenuItem onClick is dropped with a warning", () => {
  const result = migrate(
    'import { MenuItem } from "@mui/material";\n' +
      "export const A = ({ go }: any) => <MenuItem value=\"x\" onClick={go}>X</MenuItem>;\n",
  );
  assert.match(result.text, /<SelectItem value="x">X<\/SelectItem>/);
  assert.doesNotMatch(result.text, /onClick/);
});

test("FormControlLabel forwards disabled onto the control and maps labelPlacement", () => {
  const result = migrate(
    'import { FormControlLabel, Checkbox } from "@mui/material";\n' +
      'export const A = ({ d }: any) => <FormControlLabel control={<Checkbox />} label="Accept" disabled={d} labelPlacement="start" />;\n',
  );
  assert.match(result.text, /<Checkbox id="accept" disabled=\{d\} \/>/);
  assert.match(result.text, /flex-row-reverse/);
});

test("FormControlLabel required goes onto the control; className onto the wrapper", () => {
  const result = migrate(
    'import { FormControlLabel, Switch } from "@mui/material";\n' +
      'export const A = () => <FormControlLabel control={<Switch />} label="Dark" required className="mt-2" />;\n',
  );
  assert.match(result.text, /<Switch id="dark" required \/>/);
  assert.match(result.text, /className="flex items-center gap-2 mt-2"/);
});

test("FormControl consumes error/required/component (no invalid div attrs) and warns", () => {
  const result = migrate(
    'import { FormControl, InputLabel } from "@mui/material";\n' +
      'export const A = () => (<FormControl fullWidth error required component="fieldset"><InputLabel>Age</InputLabel></FormControl>);\n',
  );
  assert.match(result.text, /<div className="grid gap-1.5 w-full">/);
  assert.doesNotMatch(result.text, /<div[^>]*\b(error|required|component)\b/);
  assert.ok(result.warnings.some((w) => w.includes("FormControl error dropped")));
});

test("TextField slotProps/inputProps/inputRef/size are consumed, not leaked onto Input", () => {
  const result = migrate(
    'import { TextField } from "@mui/material";\n' +
      'export const A = () => <TextField label="Code" slotProps={{ htmlInput: { maxLength: 5 } }} size="small" inputRef={undefined} />;\n',
  );
  assert.doesNotMatch(result.text, /slotProps/);
  assert.doesNotMatch(result.text, /inputRef/);
  assert.doesNotMatch(result.text, /size="small"/);
  assert.ok(result.warnings.some((w) => w.includes("slotProps")));
});
