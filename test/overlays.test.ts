import { test } from "node:test";
import assert from "node:assert/strict";
import { Project } from "ts-morph";
import { runMigration } from "../src/run.js";

function migrate(source: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("Test.tsx", source);
  return runMigration(file);
}

test("Accordion defaultExpanded maps to defaultValue and disabled forwards to the item", () => {
  const result = migrate(
    'import { Accordion, AccordionSummary, AccordionDetails } from "@mui/material";\n' +
      "export const A = ({ d }: any) => (<Accordion defaultExpanded disabled={d}><AccordionSummary>H</AccordionSummary><AccordionDetails>B</AccordionDetails></Accordion>);\n",
  );
  assert.match(result.text, /<Accordion type="single" collapsible defaultValue="item-1">/);
  assert.match(result.text, /<AccordionItem value="item-1" disabled=\{d\}>/);
});

test("Tab disabled is preserved on TabsTrigger", () => {
  const result = migrate(
    'import { Tabs, Tab } from "@mui/material";\n' +
      'export const A = ({ v, h }: any) => (<Tabs value={v} onChange={h}><Tab label="One" value="one" /><Tab label="Two" value="two" disabled /></Tabs>);\n',
  );
  assert.match(result.text, /<TabsTrigger value="two" disabled>Two<\/TabsTrigger>/);
});

test("Tooltip enterDelay maps to delayDuration on the provider", () => {
  const result = migrate(
    'import { Tooltip, IconButton } from "@mui/material";\n' +
      'export const A = () => (<Tooltip title="Delete" enterDelay={500}><IconButton>x</IconButton></Tooltip>);\n',
  );
  assert.match(result.text, /<TooltipProvider delayDuration=\{500\}>/);
});

test("Badge is gated on invisible", () => {
  const result = migrate(
    'import { Badge } from "@mui/material";\n' +
      "export const A = ({ n }: any) => (<Badge badgeContent={n} invisible={n === 0}><span>i</span></Badge>);\n",
  );
  assert.match(result.text, /\{!\(n === 0\) && <Badge/);
});

test("Badge hides at zero badgeContent by default", () => {
  const result = migrate(
    'import { Badge } from "@mui/material";\n' +
      "export const A = ({ n }: any) => (<Badge badgeContent={n}><span>i</span></Badge>);\n",
  );
  assert.match(result.text, /\{Boolean\(n\) && <Badge/);
});

test("bare LinearProgress warns about the missing indeterminate mode", () => {
  const result = migrate(
    'import { LinearProgress } from "@mui/material";\nexport const A = () => <LinearProgress />;\n',
  );
  assert.match(result.text, /<Progress \/>/);
  assert.ok(result.warnings.some((w) => w.includes("indeterminate")));
});

test("determinate LinearProgress does not warn about indeterminate", () => {
  const result = migrate(
    'import { LinearProgress } from "@mui/material";\nexport const A = () => <LinearProgress variant="determinate" value={40} />;\n',
  );
  assert.match(result.text, /<Progress value=\{40\} \/>/);
  assert.ok(!result.warnings.some((w) => w.includes("indeterminate")));
});
