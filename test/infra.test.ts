import { test } from "node:test";
import assert from "node:assert/strict";
import { Project } from "ts-morph";
import { runMigration } from "../src/run.js";

function migrate(source: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("Infra.tsx", source);
  return runMigration(file);
}

test("ThemeProvider is unwrapped and CssBaseline removed", () => {
  const result = migrate(
    'import { ThemeProvider, CssBaseline, createTheme } from "@mui/material";\nconst theme = createTheme();\nexport const App = () => (\n  <ThemeProvider theme={theme}>\n    <CssBaseline />\n    <main>hi</main>\n  </ThemeProvider>\n);\n',
  );
  assert.match(result.text, /<main>hi<\/main>/);
  assert.doesNotMatch(result.text, /ThemeProvider/);
  assert.doesNotMatch(result.text, /CssBaseline/);
  assert.match(result.text, /createTheme/);
  assert.match(result.text, /import \{ createTheme \} from "@mui\/material"/);
  assert.ok(result.warnings.some((warning) => warning.includes("theme provider removed")));
  assert.ok(result.warnings.some((warning) => warning.includes("styling utilities")));
});

test("ThemeProvider from @mui/material/styles (deep named import) is unwrapped", () => {
  const result = migrate(
    'import { ThemeProvider } from "@mui/material/styles";\nexport const App = ({ theme }) => (<ThemeProvider theme={theme}><div>x</div></ThemeProvider>);\n',
  );
  assert.match(result.text, /<div>x<\/div>/);
  assert.doesNotMatch(result.text, /ThemeProvider/);
  assert.doesNotMatch(result.text, /@mui\/material\/styles/);
});

test("Emotion CacheProvider is unwrapped", () => {
  const result = migrate(
    'import { CacheProvider } from "@emotion/react";\nexport const App = ({ cache, children }) => (<CacheProvider value={cache}>{children}</CacheProvider>);\n',
  );
  assert.match(result.text, /\{children\}/);
  assert.doesNotMatch(result.text, /CacheProvider/);
  assert.doesNotMatch(result.text, /@emotion\/react/);
});

test("styled is left in place with a warning", () => {
  const result = migrate(
    'import { styled } from "@mui/material/styles";\nconst Box2 = styled("div")({ color: "red" });\nexport const A = () => <Box2 />;\n',
  );
  assert.match(result.text, /styled\("div"\)/);
  assert.ok(result.warnings.some((warning) => warning.includes("styling utilities")));
});
