import { Node, SyntaxKind } from "ts-morph";
import type { ObjectLiteralExpression, SourceFile } from "ts-morph";

export interface ThemeComponentOverride {
  /** e.g. "MuiButton". */
  component: string;
  defaultProps: string[];
  hasStyleOverrides: boolean;
  hasVariants: boolean;
}

export interface ThemeTokens {
  /** shadcn CSS variable name (without `--`) -> value (hex/rgb/keyword). */
  colors: Record<string, string>;
  /** CSS radius value, e.g. "8px". */
  radius?: string;
  mode?: "light" | "dark";
  /** Custom spacing factor (MUI default is 8). */
  spacing?: number;
  fontFamily?: string;
  /** theme.components global overrides (defaultProps/styleOverrides/variants). */
  components: ThemeComponentOverride[];
  /** Palette paths that exist but couldn't be statically evaluated. */
  unresolved: string[];
}

// MUI palette paths -> shadcn semantic CSS variables.
const COLOR_MAP: { path: string[]; cssVar: string }[] = [
  { path: ["palette", "primary", "main"], cssVar: "primary" },
  { path: ["palette", "primary", "contrastText"], cssVar: "primary-foreground" },
  { path: ["palette", "secondary", "main"], cssVar: "secondary" },
  { path: ["palette", "secondary", "contrastText"], cssVar: "secondary-foreground" },
  { path: ["palette", "error", "main"], cssVar: "destructive" },
  { path: ["palette", "background", "default"], cssVar: "background" },
  { path: ["palette", "background", "paper"], cssVar: "card" },
  { path: ["palette", "text", "primary"], cssVar: "foreground" },
  { path: ["palette", "text", "secondary"], cssVar: "muted-foreground" },
  { path: ["palette", "divider"], cssVar: "border" },
];

const THEME_FACTORIES = new Set(["createTheme", "extendTheme", "createMuiTheme", "responsiveFontSizes"]);

function findThemeArgument(sourceFile: SourceFile): ObjectLiteralExpression | null {
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression().getText();
    const name = callee.includes(".") ? (callee.split(".").pop() ?? "") : callee;
    if (!THEME_FACTORIES.has(name)) continue;
    const first = call.getArguments()[0];
    if (first && Node.isObjectLiteralExpression(first)) return first;
  }
  return null;
}

// Read a literal (string/number) at a nested object path. `found` is true when the
// path resolves to a property, even if its value isn't a static literal.
function literalAtPath(root: ObjectLiteralExpression, path: string[]): { value: string | null; found: boolean } {
  let current: ObjectLiteralExpression = root;
  for (let index = 0; index < path.length; index++) {
    const property = current.getProperty(path[index]!);
    if (!property || !Node.isPropertyAssignment(property)) return { value: null, found: false };
    const initializer = property.getInitializer();
    if (index === path.length - 1) {
      if (initializer && Node.isStringLiteral(initializer)) return { value: initializer.getLiteralValue(), found: true };
      if (initializer && Node.isNumericLiteral(initializer)) return { value: initializer.getText(), found: true };
      return { value: null, found: true };
    }
    if (initializer && Node.isObjectLiteralExpression(initializer)) current = initializer;
    else return { value: null, found: false };
  }
  return { value: null, found: false };
}

export function scanThemeTokens(sourceFile: SourceFile): ThemeTokens | null {
  const root = findThemeArgument(sourceFile);
  if (!root) return null;

  const tokens: ThemeTokens = { colors: {}, components: [], unresolved: [] };
  for (const { path, cssVar } of COLOR_MAP) {
    const result = literalAtPath(root, path);
    if (result.value) tokens.colors[cssVar] = result.value;
    else if (result.found) tokens.unresolved.push(path.join("."));
  }

  const radius = literalAtPath(root, ["shape", "borderRadius"]);
  if (radius.value) {
    const px = Number.parseFloat(radius.value);
    if (!Number.isNaN(px)) tokens.radius = `${px}px`;
  }

  const mode = literalAtPath(root, ["palette", "mode"]);
  if (mode.value === "dark" || mode.value === "light") tokens.mode = mode.value;

  const spacingProperty = root.getProperty("spacing");
  if (spacingProperty && Node.isPropertyAssignment(spacingProperty)) {
    const initializer = spacingProperty.getInitializer();
    if (initializer && Node.isNumericLiteral(initializer)) tokens.spacing = Number.parseFloat(initializer.getText());
  }

  const font = literalAtPath(root, ["typography", "fontFamily"]);
  if (font.value) tokens.fontFamily = font.value;

  const componentsProperty = root.getProperty("components");
  if (componentsProperty && Node.isPropertyAssignment(componentsProperty)) {
    const componentsObject = componentsProperty.getInitializer();
    if (componentsObject && Node.isObjectLiteralExpression(componentsObject)) {
      for (const entry of componentsObject.getProperties()) {
        if (!Node.isPropertyAssignment(entry)) continue;
        const overrideObject = entry.getInitializer();
        if (!overrideObject || !Node.isObjectLiteralExpression(overrideObject)) continue;
        const defaultProps: string[] = [];
        const defaultPropsProperty = overrideObject.getProperty("defaultProps");
        if (defaultPropsProperty && Node.isPropertyAssignment(defaultPropsProperty)) {
          const defaultPropsObject = defaultPropsProperty.getInitializer();
          if (defaultPropsObject && Node.isObjectLiteralExpression(defaultPropsObject)) {
            for (const property of defaultPropsObject.getProperties()) {
              if (Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property)) {
                defaultProps.push(property.getName());
              }
            }
          }
        }
        const hasStyleOverrides = Boolean(overrideObject.getProperty("styleOverrides"));
        const hasVariants = Boolean(overrideObject.getProperty("variants"));
        if (defaultProps.length || hasStyleOverrides || hasVariants) {
          tokens.components.push({
            component: entry.getName().replace(/^["']|["']$/g, ""),
            defaultProps,
            hasStyleOverrides,
            hasVariants,
          });
        }
      }
    }
  }

  const hasContent =
    Object.keys(tokens.colors).length > 0 || tokens.radius !== undefined || tokens.components.length > 0;
  if (!hasContent) return null;
  return tokens;
}

// A :root override block to append after shadcn's tokens (so it wins the cascade).
export function buildThemeCss(tokens: ThemeTokens): string {
  const lines: string[] = [];
  for (const [cssVar, value] of Object.entries(tokens.colors)) lines.push(`  --${cssVar}: ${value};`);
  if (tokens.radius) lines.push(`  --radius: ${tokens.radius};`);
  if (lines.length === 0) return "";
  return [
    "",
    "/* Brand tokens extracted from your MUI createTheme() by mui-to-shadcn.",
    "   MUI palette values are mapped onto shadcn's semantic tokens — review them",
    "   (convert to your color format if desired) and remove this note. */",
    ":root {",
    ...lines,
    "}",
    "",
  ].join("\n");
}
