import { test } from "node:test";
import assert from "node:assert/strict";
import { Project } from "ts-morph";
import { runMigration } from "../src/run.js";

function migrate(source: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("Handlers.tsx", source);
  return runMigration(file);
}

test("Checkbox handler rewrites e.target.checked to the boolean param", () => {
  const result = migrate(
    'import { Checkbox } from "@mui/material";\nexport const A = () => <Checkbox onChange={(e) => setChecked(e.target.checked)} />;\n',
  );
  assert.match(result.text, /onCheckedChange=\{\(e\) => setChecked\(e\)\}/);
});

test("Select handler rewrites e.target.value to the value param", () => {
  const result = migrate(
    'import { Select, MenuItem } from "@mui/material";\nexport const A = () => (<Select value={v} onChange={(e) => setV(e.target.value)}><MenuItem value="a">A</MenuItem></Select>);\n',
  );
  assert.match(result.text, /onValueChange=\{\(e\) => setV\(e\)\}/);
});

test("two-arg Tabs handler drops the unused event param", () => {
  const result = migrate(
    'import { Tabs, Tab } from "@mui/material";\nexport const A = () => (<Tabs value={v} onChange={(e, nv) => setV(nv)}><Tab label="x" value="a" /></Tabs>);\n',
  );
  assert.match(result.text, /onValueChange=\{\(nv\) => setV\(nv\)\}/);
});

test("a handler that also uses the event is left intact", () => {
  const result = migrate(
    'import { Checkbox } from "@mui/material";\nexport const A = () => <Checkbox onChange={(e) => { e.preventDefault(); setChecked(e.target.checked); }} />;\n',
  );
  assert.match(result.text, /e\.preventDefault\(\)/);
  assert.match(result.text, /e\.target\.checked/);
});

test("an already value-style handler is left unchanged", () => {
  const result = migrate(
    'import { Switch } from "@mui/material";\nexport const A = () => <Switch onChange={(checked) => setOn(checked)} />;\n',
  );
  assert.match(result.text, /onCheckedChange=\{\(checked\) => setOn\(checked\)\}/);
});
