import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createRequire } from "node:module";
import { Project } from "ts-morph";
import { runMigration } from "./run.js";
import { collectSourceFiles } from "./paths.js";
import { applyTailwind, planTailwind } from "./tailwind.js";
import type { TailwindPlan } from "./tailwind.js";
import { buildMigrationDoc } from "./migration-doc.js";
import type { FileReport } from "./migration-doc.js";

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export interface SetupOptions {
  target: string[];
  base: "radix" | "base";
  /** shadcn style: vega | nova | maia | lyra | mira (passed as --preset to shadcn init). */
  style: string;
  /** Raw preset name or code; overrides base+style when set (e.g. a ui.shadcn.com code). */
  preset?: string;
  packageManager?: PackageManager;
  dryRun: boolean;
  skipSx: boolean;
  skipTailwind: boolean;
  /** Write a MIGRATION.md LLM handoff for the remaining manual work (default true). */
  writeMd: boolean;
  cwd: string;
}

export interface SetupPlan {
  manager: PackageManager;
  fileCount: number;
  changedCount: number;
  componentList: string[];
  needsInit: boolean;
  preset: string;
  tailwind: TailwindPlan;
  tailwindCommand: string[] | null;
  initCommand: string[] | null;
  addCommand: string[] | null;
  prettierCommand: string[];
  steps: string[];
  mui: string[];
  manualTotals: Map<string, number>;
  writes: { path: string; text: string; changed: boolean }[];
  /** Per-file manual hits + warnings, for the MIGRATION.md handoff. */
  reports: FileReport[];
  /** Whether MIGRATION.md will be written (writeMd requested and there is work to hand off). */
  writeMd: boolean;
  /** Manual-task and review-note totals across all files. */
  mdTasks: number;
  mdReviews: number;
}

export type SetupPlanResult = { ok: true; plan: SetupPlan } | { ok: false; error: string };

interface CommandRunner {
  dlx: string[];
  exec: string[];
  add: string[];
}

export function detectPackageManager(cwd: string): PackageManager {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) return "bun";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "package-lock.json"))) return "npm";
  return "pnpm";
}

function commandRunner(manager: PackageManager): CommandRunner {
  switch (manager) {
    case "pnpm":
      return { dlx: ["pnpm", "dlx"], exec: ["pnpm", "exec"], add: ["pnpm", "add", "-D"] };
    case "bun":
      return { dlx: ["bunx"], exec: ["bunx"], add: ["bun", "add", "-d"] };
    case "yarn":
      return { dlx: ["yarn", "dlx"], exec: ["yarn", "exec"], add: ["yarn", "add", "-D"] };
    case "npm":
    default:
      return { dlx: ["npx", "-y"], exec: ["npx"], add: ["npm", "install", "-D"] };
  }
}

function run(command: string[], cwd: string): number {
  const [binary, ...args] = command;
  if (!binary) return 1;
  const result = spawnSync(binary, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) {
    console.error(`Error running "${command.join(" ")}": ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

function hasComponentsJson(cwd: string): boolean {
  return existsSync(join(cwd, "components.json"));
}

function muiDependencies(cwd: string): string[] {
  const packageJsonPath = join(cwd, "package.json");
  if (!existsSync(packageJsonPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const all = { ...parsed.dependencies, ...parsed.devDependencies };
    return Object.keys(all).filter((name) => name.startsWith("@mui/") || name.startsWith("@emotion/"));
  } catch {
    return [];
  }
}

/** Analyze the target and build the full plan without touching anything. */
export function planSetup(options: SetupOptions): SetupPlanResult {
  const cwd = options.cwd;
  const manager = options.packageManager ?? detectPackageManager(cwd);
  const runner = commandRunner(manager);

  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const files = collectSourceFiles(project, options.target);
  if (files.length === 0) {
    return { ok: false, error: `No .ts/.tsx files found in: ${options.target.join(", ")}` };
  }

  const components = new Set<string>();
  let changedCount = 0;
  const manualTotals = new Map<string, number>();
  const writes: { path: string; text: string; changed: boolean }[] = [];
  const reports: FileReport[] = [];

  for (const file of files) {
    const result = runMigration(file, { sx: !options.skipSx, base: options.base });
    for (const slug of result.components) components.add(slug);
    for (const hit of result.manual) {
      manualTotals.set(hit.component, (manualTotals.get(hit.component) ?? 0) + 1);
    }
    if (result.changed) changedCount += 1;
    writes.push({ path: file.getFilePath(), text: result.text, changed: result.changed });
    if (result.manual.length || result.warnings.length) {
      reports.push({
        file: relative(cwd, file.getFilePath()),
        manual: result.manual,
        warnings: result.warnings,
      });
    }
  }

  const componentList = [...components].sort();
  const needsInit = !hasComponentsJson(cwd);
  // shadcn CLI v4: style is --preset (nova, vega, …); primitives are --base (radix | base).
  // A raw preset override (a ui.shadcn.com code) wins over --style.
  const preset = options.preset ?? options.style;
  const initCommand = needsInit
    ? [...runner.dlx, "shadcn@latest", "init", "--base", options.base, "--preset", preset, "--yes"]
    : null;
  const addCommand = componentList.length
    ? [...runner.dlx, "shadcn@latest", "add", ...componentList, "--yes"]
    : null;
  const prettierCommand = [...runner.exec, "prettier", "--write", ...options.target];
  const mui = muiDependencies(cwd);

  // shadcn init aborts on its Tailwind preflight when Tailwind is missing, which is the
  // normal state of an MUI/Emotion project. Set it up first (unless asked to skip, or
  // unless the project is already initialized).
  const tailwind: TailwindPlan =
    needsInit && !options.skipTailwind
      ? planTailwind(cwd)
      : { needed: false, framework: "other", install: [], css: null, postcssCreate: null, notes: [] };
  const tailwindCommand = tailwind.needed ? [...runner.add, ...tailwind.install] : null;

  const mdTasks = reports.reduce((sum, r) => sum + r.manual.length, 0);
  const mdReviews = reports.reduce((sum, r) => sum + r.warnings.length, 0);
  const writeMd = options.writeMd && reports.length > 0;

  const steps: string[] = [];
  if (tailwindCommand) steps.push(`${tailwindCommand.join(" ")}  (Tailwind setup: ${describeTailwind(tailwind)})`);
  steps.push(
    initCommand ? initCommand.join(" ") : "shadcn already initialized (components.json present) - skipped",
  );
  steps.push(addCommand ? addCommand.join(" ") : "no components to add");
  steps.push(`codemod writes ${changedCount} file(s)`);
  steps.push(prettierCommand.join(" "));
  if (writeMd) {
    steps.push(`write MIGRATION.md (${mdTasks} task${mdTasks === 1 ? "" : "s"} + ${mdReviews} review note${mdReviews === 1 ? "" : "s"} for an LLM)`);
  }

  return {
    ok: true,
    plan: {
      manager,
      fileCount: files.length,
      changedCount,
      componentList,
      needsInit,
      preset,
      tailwind,
      tailwindCommand,
      initCommand,
      addCommand,
      prettierCommand,
      steps,
      mui,
      manualTotals,
      writes,
      reports,
      writeMd,
      mdTasks,
      mdReviews,
    },
  };
}

/** Run a prepared plan: installs, shadcn init/add, file writes, prettier. */
export function executeSetup(plan: SetupPlan, cwd: string, base: "radix" | "base"): number {
  if (plan.tailwindCommand) {
    console.log("> tailwind setup");
    const status = run(plan.tailwindCommand, cwd);
    if (status !== 0) {
      console.error("Tailwind install failed; aborting (shadcn init needs Tailwind).");
      return status;
    }
    const applied = applyTailwind(plan.tailwind, cwd);
    if (applied.cssPath) {
      const verb = applied.cssAction === "present" ? "already imports Tailwind:" : `${applied.cssAction}:`;
      console.log(`  ${verb} ${applied.cssPath}`);
    }
    if (applied.postcssCreated) console.log(`  created: ${applied.postcssCreated}`);
  }

  if (plan.initCommand) {
    console.log("> shadcn init");
    const status = run(plan.initCommand, cwd);
    if (status !== 0) {
      console.error("shadcn init failed; aborting.");
      return status;
    }
  }

  if (plan.addCommand) {
    console.log("> shadcn add");
    const status = run(plan.addCommand, cwd);
    if (status !== 0) {
      console.error("shadcn add failed; aborting.");
      return status;
    }
  }

  writeChangedFiles(plan, cwd);

  console.log("> prettier");
  run(plan.prettierCommand, cwd);

  writeMigrationDoc(plan, cwd, base);
  printManual(plan.manualTotals, plan.mui, base, plan.tailwind.notes, plan.writeMd);
  return 0;
}

/** Write the converted files only (no installs, no formatter). Used for "convert only". */
export function writeMigratedFiles(plan: SetupPlan, cwd: string, base: "radix" | "base"): number {
  writeChangedFiles(plan, cwd);
  writeMigrationDoc(plan, cwd, base);
  // No Tailwind notes here: convert-only does not run the Tailwind/shadcn setup.
  printManual(plan.manualTotals, plan.mui, base, [], plan.writeMd);
  return 0;
}

function writeChangedFiles(plan: SetupPlan, cwd: string): void {
  console.log("> codemod writes files");
  let count = 0;
  for (const entry of plan.writes) {
    if (!entry.changed) continue;
    writeFileSync(entry.path, entry.text);
    console.log(`  changed: ${relative(cwd, entry.path)}`);
    count += 1;
  }
  if (count === 0) console.log("  (no files needed changes)");
}

/** Write the LLM handoff (MIGRATION.md) at the project root when the plan calls for it. */
function writeMigrationDoc(plan: SetupPlan, cwd: string, base: "radix" | "base"): void {
  if (!plan.writeMd) return;
  const doc = buildMigrationDoc({
    files: plan.reports,
    components: plan.componentList,
    base,
    version: readVersion(),
    generatedAt: new Date().toISOString().slice(0, 10),
  });
  writeFileSync(join(cwd, "MIGRATION.md"), doc);
  console.log("> MIGRATION.md");
  console.log(
    `  wrote MIGRATION.md (${plan.mdTasks} task${plan.mdTasks === 1 ? "" : "s"} + ` +
      `${plan.mdReviews} review note${plan.mdReviews === 1 ? "" : "s"}) — hand it to an LLM to finish the manual work`,
  );
}

function readVersion(): string {
  try {
    const pkg = createRequire(import.meta.url)("../package.json") as { version?: string };
    return pkg.version ?? "";
  } catch {
    return "";
  }
}

export function runSetup(options: SetupOptions): number {
  const result = planSetup(options);
  if (!result.ok) {
    console.error(result.error);
    return 1;
  }
  const plan = result.plan;

  console.log("Package manager:", plan.manager);
  console.log(`Files with changes: ${plan.changedCount} of ${plan.fileCount}`);
  console.log(`Required shadcn components (${plan.componentList.length}): ${plan.componentList.join(" ") || "none"}`);
  console.log("");
  console.log("Planned steps:");
  plan.steps.forEach((step, index) => console.log(`  ${index + 1}. ${step}`));
  console.log("");

  if (options.dryRun) {
    console.log("Dry run (--dry-run): nothing executed.");
    printManual(plan.manualTotals, plan.mui, options.base, plan.tailwind.notes, plan.writeMd);
    return 0;
  }

  return executeSetup(plan, options.cwd, options.base);
}

export function describeTailwind(plan: TailwindPlan): string {
  const parts: string[] = [];
  if (plan.css) parts.push(`${plan.css.exists ? "add import to" : "create"} ${plan.css.path}`);
  parts.push(plan.postcssCreate ? `create ${plan.postcssCreate}` : "postcss config present");
  return parts.join("; ");
}

function printManual(
  manualTotals: Map<string, number>,
  mui: string[],
  base: "radix" | "base",
  tailwindNotes: string[] = [],
  wroteMd = false,
): void {
  console.log("");
  console.log("Still to do manually:");
  if (wroteMd) {
    console.log("  - See MIGRATION.md for the full, per-file task list — hand it to an LLM to finish the rest");
  }
  for (const note of tailwindNotes) console.log(`  - ${note}`);
  console.log(
    "  - Check handler signatures: onChange became onValueChange/onCheckedChange; the callback now receives a value/boolean instead of an event",
  );
  if (manualTotals.size) {
    console.log("  - Rebuild components without a shadcn equivalent manually:");
    const sorted = [...manualTotals].sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sorted) console.log(`      ${name}: ${count}`);
  }
  if (mui.length) {
    console.log(`  - Remove MUI dependencies once everything is migrated: ${mui.join(", ")}`);
    console.log("  - Remove ThemeProvider, CssBaseline and createTheme from the layout/provider");
  }
  if (base === "base") {
    console.log("  - Base UI: replace asChild with the render prop; checked is strictly boolean, value strictly an array");
  }
  console.log("  - Review visual QA and layout (especially Grid)");
}
