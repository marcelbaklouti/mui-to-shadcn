import { test } from "node:test";
import assert from "node:assert/strict";
import { Project } from "ts-morph";
import { runMigration } from "../src/run.js";

function migrate(source: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("Test.tsx", source);
  return runMigration(file);
}

test("Alert success/warning/info are tinted via classes (not identical gray boxes)", () => {
  const success = migrate(
    'import { Alert } from "@mui/material";\nexport const A = () => <Alert severity="success">Saved</Alert>;\n',
  );
  assert.match(success.text, /text-green-700/);
  const warning = migrate(
    'import { Alert } from "@mui/material";\nexport const A = () => <Alert severity="warning">Careful</Alert>;\n',
  );
  assert.match(warning.text, /text-amber-700/);
});

test("Alert error still maps to the destructive variant", () => {
  const result = migrate(
    'import { Alert } from "@mui/material";\nexport const A = () => <Alert severity="error">Boom</Alert>;\n',
  );
  assert.match(result.text, /variant="destructive"/);
});

test("Chip onDelete becomes a remove button wired to the handler", () => {
  const result = migrate(
    'import { Chip } from "@mui/material";\n' +
      "export const A = ({ onRemove }: any) => <Chip label=\"tag\" onDelete={() => onRemove()} />;\n",
  );
  assert.match(result.text, /<button type="button" onClick=\{\(\) => onRemove\(\)\}/);
  assert.match(result.text, /<X className="size-3" \/>/);
  assert.match(result.text, /from "lucide-react"/);
});

test("Dialog fullWidth + maxWidth become classes on DialogContent", () => {
  const result = migrate(
    'import { Dialog, DialogTitle } from "@mui/material";\n' +
      'export const A = ({ open }: any) => (<Dialog open={open} fullWidth maxWidth="md"><DialogTitle>T</DialogTitle></Dialog>);\n',
  );
  assert.match(result.text, /<DialogContent className="sm:max-w-\[900px\] w-full">/);
});

test("Dialog fullScreen becomes a full-screen DialogContent", () => {
  const result = migrate(
    'import { Dialog, DialogTitle } from "@mui/material";\n' +
      "export const A = ({ open }: any) => (<Dialog open={open} fullScreen><DialogTitle>T</DialogTitle></Dialog>);\n",
  );
  assert.match(result.text, /<DialogContent className="h-screen w-screen max-w-none rounded-none">/);
});
