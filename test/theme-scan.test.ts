import { test } from "node:test";
import assert from "node:assert/strict";
import { Project } from "ts-morph";
import { scanThemeTokens, buildThemeCss } from "../src/theme-scan.js";

function scan(source: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("theme.ts", source);
  return scanThemeTokens(file);
}

test("createTheme palette maps to shadcn CSS variables", () => {
  const tokens = scan(
    'import { createTheme } from "@mui/material/styles";\n' +
      "export const theme = createTheme({\n" +
      "  palette: {\n" +
      '    primary: { main: "#1976d2", contrastText: "#fff" },\n' +
      '    secondary: { main: "#9c27b0" },\n' +
      '    error: { main: "#d32f2f" },\n' +
      '    background: { default: "#fafafa", paper: "#ffffff" },\n' +
      '    text: { primary: "rgba(0,0,0,0.87)", secondary: "rgba(0,0,0,0.6)" },\n' +
      '    divider: "#e0e0e0",\n' +
      "  },\n" +
      "  shape: { borderRadius: 12 },\n" +
      "});\n",
  );
  assert.ok(tokens);
  assert.equal(tokens.colors.primary, "#1976d2");
  assert.equal(tokens.colors["primary-foreground"], "#fff");
  assert.equal(tokens.colors.secondary, "#9c27b0");
  assert.equal(tokens.colors.destructive, "#d32f2f");
  assert.equal(tokens.colors.background, "#fafafa");
  assert.equal(tokens.colors.card, "#ffffff");
  assert.equal(tokens.colors.foreground, "rgba(0,0,0,0.87)");
  assert.equal(tokens.colors["muted-foreground"], "rgba(0,0,0,0.6)");
  assert.equal(tokens.colors.border, "#e0e0e0");
  assert.equal(tokens.radius, "12px");
});

test("palette.mode and custom spacing are detected", () => {
  const tokens = scan(
    'import { createTheme } from "@mui/material/styles";\n' +
      'export const theme = createTheme({ palette: { mode: "dark", primary: { main: "#90caf9" } }, spacing: 4 });\n',
  );
  assert.ok(tokens);
  assert.equal(tokens.mode, "dark");
  assert.equal(tokens.spacing, 4);
});

test("non-literal palette values are recorded as unresolved, not crashed on", () => {
  const tokens = scan(
    'import { createTheme } from "@mui/material/styles";\n' +
      "const brand = getBrand();\n" +
      "export const theme = createTheme({ palette: { primary: { main: brand }, error: { main: \"#f00\" } } });\n",
  );
  assert.ok(tokens);
  assert.ok(tokens.unresolved.includes("palette.primary.main"));
  assert.equal(tokens.colors.destructive, "#f00");
});

test("no createTheme returns null", () => {
  assert.equal(scan('export const x = 1;\n'), null);
});

test("buildThemeCss emits a :root override block", () => {
  const css = buildThemeCss({ colors: { primary: "#1976d2", background: "#fafafa" }, radius: "12px", unresolved: [] });
  assert.match(css, /:root \{/);
  assert.match(css, /--primary: #1976d2;/);
  assert.match(css, /--radius: 12px;/);
});
