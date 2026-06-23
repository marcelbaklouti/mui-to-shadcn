import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * shadcn's `init` runs a Tailwind preflight check. For Tailwind v4 it fails with
 * TAILWIND_NOT_CONFIGURED unless `tailwindcss` is a dependency *and* some CSS file
 * imports Tailwind (`@import "tailwindcss"`). A typical MUI project uses Emotion and
 * has neither, so `init` aborts before it can do anything.
 *
 * This module sets up the minimum Tailwind v4 wiring (install + a CSS import + a
 * PostCSS config) so the preflight passes and the project actually builds. It only
 * acts when Tailwind is entirely absent; a project that already ships Tailwind is
 * left untouched.
 */

export type Framework = "next" | "vite" | "other";

export interface TailwindPlan {
  /** True when Tailwind is missing and we will set it up. */
  needed: boolean;
  framework: Framework;
  /** Packages to install as dev dependencies. */
  install: string[];
  /** CSS file that should receive the Tailwind import. */
  css: { path: string; exists: boolean } | null;
  /** Relative path of a PostCSS config to create, or null when one already exists. */
  postcssCreate: string | null;
  /** Notes and manual follow-ups for the user. */
  notes: string[];
}

export interface TailwindApplyResult {
  cssAction: "added" | "present" | "created" | null;
  cssPath: string | null;
  postcssCreated: string | null;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const TAILWIND_IMPORT = '@import "tailwindcss";';

// Conventional global stylesheet locations, most-specific first.
const GLOBAL_CSS_CANDIDATES = [
  "src/app/globals.css",
  "app/globals.css",
  "src/app/global.css",
  "app/global.css",
  "src/styles/globals.css",
  "styles/globals.css",
  "src/index.css",
  "src/styles/index.css",
  "src/main.css",
  "src/App.css",
  "app.css",
  "styles.css",
  "index.css",
];

const POSTCSS_CANDIDATES = [
  "postcss.config.mjs",
  "postcss.config.js",
  "postcss.config.cjs",
  "postcss.config.ts",
  "postcss.config.json",
  ".postcssrc",
  ".postcssrc.json",
  ".postcssrc.js",
  ".postcssrc.cjs",
  ".postcssrc.mjs",
];

const POSTCSS_CONFIG = `const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
`;

function readPackageJson(cwd: string): PackageJson | null {
  const file = join(cwd, "package.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

function allDependencies(pkg: PackageJson | null): Record<string, string> {
  if (!pkg) return {};
  return { ...pkg.dependencies, ...pkg.devDependencies };
}

export function hasTailwind(pkg: PackageJson | null): boolean {
  return Boolean(allDependencies(pkg)["tailwindcss"]);
}

export function detectFramework(pkg: PackageJson | null): Framework {
  const deps = allDependencies(pkg);
  if (deps["next"]) return "next";
  if (deps["vite"] || deps["@vitejs/plugin-react"] || deps["@vitejs/plugin-react-swc"]) {
    return "vite";
  }
  return "other";
}

function findExisting(cwd: string, candidates: string[]): string | null {
  for (const rel of candidates) {
    if (existsSync(join(cwd, rel))) return rel;
  }
  return null;
}

function defaultCssPath(cwd: string): string {
  if (existsSync(join(cwd, "src", "app"))) return "src/app/globals.css";
  if (existsSync(join(cwd, "app"))) return "app/globals.css";
  if (existsSync(join(cwd, "src"))) return "src/index.css";
  return "app/globals.css";
}

export function planTailwind(cwd: string): TailwindPlan {
  const pkg = readPackageJson(cwd);
  const framework = detectFramework(pkg);

  // Only touch projects with no Tailwind at all — that is the case shadcn init
  // rejects. Anything already on Tailwind is assumed configured and left alone.
  if (hasTailwind(pkg)) {
    return { needed: false, framework, install: [], css: null, postcssCreate: null, notes: [] };
  }

  const notes: string[] = [];

  const existingCss = findExisting(cwd, GLOBAL_CSS_CANDIDATES);
  const css = existingCss
    ? { path: existingCss, exists: true }
    : { path: defaultCssPath(cwd), exists: false };
  if (!existingCss) {
    notes.push(
      `Tailwind: a new ${css.path} was created; import it from your root layout/entry if it is not already.`,
    );
  }

  const existingPostcss = findExisting(cwd, POSTCSS_CANDIDATES);
  let postcssCreate: string | null = null;
  if (existingPostcss) {
    const content = readFileSync(join(cwd, existingPostcss), "utf8");
    if (!/tailwind/i.test(content)) {
      notes.push(
        `Tailwind: ${existingPostcss} exists but references no Tailwind plugin; add "@tailwindcss/postcss" to its plugins manually.`,
      );
    }
  } else {
    postcssCreate = "postcss.config.mjs";
  }

  if (framework === "vite") {
    notes.push(
      'Tailwind: Vite detected — the PostCSS setup works, but the official "@tailwindcss/vite" plugin is the recommended alternative.',
    );
  } else if (framework === "other") {
    notes.push(
      "Tailwind: framework not recognized as Next.js or Vite; verify the PostCSS/Tailwind wiring builds in your setup.",
    );
  }

  return {
    needed: true,
    framework,
    install: ["tailwindcss", "@tailwindcss/postcss", "postcss"],
    css,
    postcssCreate,
    notes,
  };
}

function addTailwindImport(filePath: string): "added" | "present" | "created" {
  if (!existsSync(filePath)) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${TAILWIND_IMPORT}\n`);
    return "created";
  }

  const content = readFileSync(filePath, "utf8");
  if (/@import\s+["']tailwindcss["']/.test(content) || /@tailwind\s+base/.test(content)) {
    return "present";
  }

  // A leading @charset, if present, must remain the very first rule; Tailwind's
  // @import goes immediately after it. Otherwise it leads the file (an @import has
  // to precede any non-import rule to stay valid).
  const lines = content.split("\n");
  if (lines[0]?.trimStart().startsWith("@charset")) {
    lines.splice(1, 0, TAILWIND_IMPORT);
    writeFileSync(filePath, lines.join("\n"));
  } else {
    writeFileSync(filePath, `${TAILWIND_IMPORT}\n${content}`);
  }
  return "added";
}

export function applyTailwind(plan: TailwindPlan, cwd: string): TailwindApplyResult {
  if (!plan.needed) return { cssAction: null, cssPath: null, postcssCreated: null };

  let cssAction: TailwindApplyResult["cssAction"] = null;
  let cssPath: string | null = null;
  if (plan.css) {
    cssPath = plan.css.path;
    cssAction = addTailwindImport(join(cwd, plan.css.path));
  }

  let postcssCreated: string | null = null;
  if (plan.postcssCreate && !existsSync(join(cwd, plan.postcssCreate))) {
    writeFileSync(join(cwd, plan.postcssCreate), POSTCSS_CONFIG);
    postcssCreated = plan.postcssCreate;
  }

  return { cssAction, cssPath, postcssCreated };
}
