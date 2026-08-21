import { test } from "node:test";
import assert from "node:assert/strict";
import { Project } from "ts-morph";
import { runMigration } from "../src/run.js";

function migrate(source: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("Test.tsx", source);
  return runMigration(file);
}

test("Button loading -> disabled + spinner child", () => {
  const result = migrate(
    'import { Button } from "@mui/material";\n' +
      "export const A = ({ saving }: any) => <Button loading={saving}>Save</Button>;\n",
  );
  assert.match(result.text, /disabled=\{saving\}/);
  assert.match(result.text, /\{saving && <Loader2 className="mr-2 size-4 animate-spin" \/>\}/);
  assert.match(result.text, /from "lucide-react"/);
});

test("Button loading merges with an existing disabled", () => {
  const result = migrate(
    'import { Button } from "@mui/material";\n' +
      "export const A = ({ saving, d }: any) => <Button loading={saving} disabled={d}>Save</Button>;\n",
  );
  assert.match(result.text, /disabled=\{d \|\| saving\}/);
});

test("@mui/lab LoadingButton converts via the Button transform", () => {
  const result = migrate(
    'import { LoadingButton } from "@mui/lab";\n' +
      'export const A = ({ saving }: any) => <LoadingButton loading={saving} variant="outlined">Save</LoadingButton>;\n',
  );
  assert.match(result.text, /<Button variant="outline" disabled=\{saving\}>/);
  assert.doesNotMatch(result.text, /@mui\/lab/);
});

test("ButtonGroup becomes shadcn ButtonGroup, keeping orientation", () => {
  const result = migrate(
    'import { Button, ButtonGroup } from "@mui/material";\n' +
      'export const A = () => (<ButtonGroup variant="contained" orientation="vertical"><Button>One</Button></ButtonGroup>);\n',
  );
  assert.match(result.text, /<ButtonGroup orientation="vertical">/);
  assert.match(result.text, /from "@\/components\/ui\/button-group"/);
  assert.doesNotMatch(result.text, /@mui\/material/);
});

test("AvatarGroup becomes an overlapping div, children convert to shadcn Avatar", () => {
  const result = migrate(
    'import { AvatarGroup, Avatar } from "@mui/material";\n' +
      'export const A = () => (<AvatarGroup max={4}><Avatar src="/a.png" /></AvatarGroup>);\n',
  );
  assert.match(result.text, /<div className="flex -space-x-2">/);
  assert.match(result.text, /<AvatarImage src="\/a.png" \/>/);
  assert.doesNotMatch(result.text, /@mui\/material/);
});
