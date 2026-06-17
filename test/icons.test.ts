import { test } from "node:test";
import assert from "node:assert/strict";
import * as lucide from "lucide-react";
import { Project } from "ts-morph";
import { runMigration } from "../src/run.js";
import { MUI_ICON_TO_LUCIDE, lucideForMuiIcon } from "../src/icon-map.js";

function migrate(source: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("Icons.tsx", source);
  return runMigration(file);
}

test("every mapped lucide-react name is a real export (guards against renames)", () => {
  const available = new Set(Object.keys(lucide));
  const invalid = [...new Set(Object.values(MUI_ICON_TO_LUCIDE))].filter((name) => !available.has(name));
  assert.deepEqual(invalid, [], `invalid lucide names: ${invalid.join(", ")}`);
});

test("variant suffixes resolve to the base icon", () => {
  assert.equal(lucideForMuiIcon("Delete"), "Trash2");
  assert.equal(lucideForMuiIcon("DeleteOutlined"), "Trash2");
  assert.equal(lucideForMuiIcon("DeleteRounded"), "Trash2");
  assert.equal(lucideForMuiIcon("SaveSharp"), "Save");
  assert.equal(lucideForMuiIcon("MailOutline"), "Mail");
});

test("named barrel icon imports convert to lucide-react", () => {
  const result = migrate(
    'import { Delete, Add } from "@mui/icons-material";\nexport const A = () => (<div><Delete /><Add /></div>);\n',
  );
  assert.match(result.text, /import \{ Plus, Trash2 \} from "lucide-react"/);
  assert.match(result.text, /<Trash2 \/>/);
  assert.match(result.text, /<Plus \/>/);
  assert.doesNotMatch(result.text, /@mui\/icons-material/);
});

test("default deep icon import converts and renames the tag", () => {
  const result = migrate(
    'import DeleteIcon from "@mui/icons-material/Delete";\nexport const A = () => <DeleteIcon />;\n',
  );
  assert.match(result.text, /import \{ Trash2 \} from "lucide-react"/);
  assert.match(result.text, /<Trash2 \/>/);
  assert.doesNotMatch(result.text, /DeleteIcon/);
  assert.doesNotMatch(result.text, /@mui\/icons-material/);
});

test("icon fontSize and color map to classes", () => {
  const result = migrate(
    'import DeleteIcon from "@mui/icons-material/Delete";\nexport const A = () => <DeleteIcon fontSize="small" color="error" />;\n',
  );
  assert.match(result.text, /<Trash2 className="size-4 text-destructive" \/>/);
});

test("existing className merges with generated icon classes", () => {
  const result = migrate(
    'import DeleteIcon from "@mui/icons-material/Delete";\nexport const A = () => <DeleteIcon className="mr-2" fontSize="small" />;\n',
  );
  assert.match(result.text, /<Trash2 className="mr-2 size-4" \/>/);
});

test("dynamic className with generated classes uses cn", () => {
  const result = migrate(
    'import DeleteIcon from "@mui/icons-material/Delete";\nexport const A = () => <DeleteIcon className={x} color="primary" />;\n',
  );
  assert.match(result.text, /className=\{cn\("text-primary", x\)\}/);
  assert.match(result.text, /import \{ cn \} from "@\/lib\/utils"/);
});

test("a bare (non-tag) icon reference uses an aliased import and is left untouched", () => {
  const result = migrate(
    'import HomeIcon from "@mui/icons-material/Home";\nexport const A = () => { const C = HomeIcon; return <C />; };\n',
  );
  assert.match(result.text, /import \{ House as HomeIcon \} from "lucide-react"/);
  assert.match(result.text, /const C = HomeIcon;/);
  assert.doesNotMatch(result.text, /@mui\/icons-material/);
});

test("unmapped icons are left as-is with a warning", () => {
  const result = migrate(
    'import Foobar from "@mui/icons-material/Foobar";\nexport const A = () => <Foobar />;\n',
  );
  assert.match(result.text, /@mui\/icons-material\/Foobar/);
  assert.ok(result.warnings.some((warning) => warning.includes("no known lucide-react mapping")));
});

test("icon import merges into an existing lucide-react import from the component pass", () => {
  const result = migrate(
    'import { CircularProgress } from "@mui/material";\nimport DeleteIcon from "@mui/icons-material/Delete";\nexport const A = () => (<div><CircularProgress /><DeleteIcon /></div>);\n',
  );
  assert.match(result.text, /import \{ Loader2, Trash2 \} from "lucide-react"/);
  assert.match(result.text, /<Loader2 className="size-10 animate-spin" \/>/);
  assert.match(result.text, /<Trash2 \/>/);
});

test("only converted named icons are removed; unmapped ones stay imported", () => {
  const result = migrate(
    'import { Delete, Foobar } from "@mui/icons-material";\nexport const A = () => (<div><Delete /><Foobar /></div>);\n',
  );
  assert.match(result.text, /import \{ Foobar \} from "@mui\/icons-material"/);
  assert.match(result.text, /import \{ Trash2 \} from "lucide-react"/);
  assert.match(result.text, /<Trash2 \/>/);
});
