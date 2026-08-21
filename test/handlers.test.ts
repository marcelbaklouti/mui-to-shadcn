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

test("a named Checkbox handler definition is rewritten (e.target.checked -> e)", () => {
  const result = migrate(
    'import { Checkbox } from "@mui/material";\n' +
      "export const A = ({ setC }: any) => {\n" +
      "  function handleCheck(event: any) { setC(event.target.checked); }\n" +
      "  return <Checkbox onChange={handleCheck} />;\n" +
      "};\n",
  );
  assert.match(result.text, /onCheckedChange=\{handleCheck\}/);
  assert.match(result.text, /setC\(event\);/);
  assert.doesNotMatch(result.text, /event\.target\.checked/);
});

test("a useCallback-wrapped handler is rewritten", () => {
  const result = migrate(
    'import { Switch } from "@mui/material";\nimport { useCallback } from "react";\n' +
      "export const A = ({ setC }: any) => {\n" +
      "  const h = useCallback((e: any) => setC(e.target.checked), []);\n" +
      "  return <Switch onChange={h} />;\n" +
      "};\n",
  );
  assert.match(result.text, /setC\(e\), \[\]\)/);
});

test("a named Select handler definition is rewritten (e.target.value -> e)", () => {
  const result = migrate(
    'import { Select, MenuItem } from "@mui/material";\n' +
      "export const A = ({ log }: any) => {\n" +
      "  const handleSelect = (event: any) => log(event.target.value);\n" +
      '  return <Select value="a" onChange={handleSelect}><MenuItem value="a">A</MenuItem></Select>;\n' +
      "};\n",
  );
  assert.match(result.text, /onValueChange=\{handleSelect\}/);
  assert.match(result.text, /log\(event\)/);
});

test("a handler that also uses the event (preventDefault) is left unrewritten", () => {
  const result = migrate(
    'import { Checkbox } from "@mui/material";\n' +
      "export const A = ({ setC }: any) => {\n" +
      "  const guarded = (e: any) => { e.preventDefault(); setC(e.target.checked); };\n" +
      "  return <Checkbox onChange={guarded} />;\n" +
      "};\n",
  );
  // unsafe to auto-fix -> body untouched (the rename warning still flags it)
  assert.match(result.text, /e\.target\.checked/);
});
