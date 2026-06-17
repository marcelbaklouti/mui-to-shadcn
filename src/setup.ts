import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Project } from "ts-morph";
import { runMigration } from "./run.js";
import { collectSourceFiles } from "./paths.js";

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export interface SetupOptions {
  target: string[];
  base: "radix" | "base";
  packageManager?: PackageManager;
  dryRun: boolean;
  skipSx: boolean;
  cwd: string;
}

interface CommandRunner {
  dlx: string[];
  exec: string[];
}

function detectPackageManager(cwd: string): PackageManager {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) return "bun";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "package-lock.json"))) return "npm";
  return "pnpm";
}

function commandRunner(manager: PackageManager): CommandRunner {
  switch (manager) {
    case "pnpm":
      return { dlx: ["pnpm", "dlx"], exec: ["pnpm", "exec"] };
    case "bun":
      return { dlx: ["bunx"], exec: ["bunx"] };
    case "yarn":
      return { dlx: ["yarn", "dlx"], exec: ["yarn", "exec"] };
    case "npm":
    default:
      return { dlx: ["npx", "-y"], exec: ["npx"] };
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

export function runSetup(options: SetupOptions): number {
  const cwd = options.cwd;
  const manager = options.packageManager ?? detectPackageManager(cwd);
  const runner = commandRunner(manager);

  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const files = collectSourceFiles(project, options.target);
  if (files.length === 0) {
    console.error("No matching files found");
    return 1;
  }

  const components = new Set<string>();
  let changedCount = 0;
  const manualTotals = new Map<string, number>();
  const planned: { path: string; text: string; changed: boolean }[] = [];

  for (const file of files) {
    const result = runMigration(file, { sx: !options.skipSx, base: options.base });
    for (const slug of result.components) components.add(slug);
    for (const hit of result.manual) {
      manualTotals.set(hit.component, (manualTotals.get(hit.component) ?? 0) + 1);
    }
    if (result.changed) changedCount += 1;
    planned.push({ path: file.getFilePath(), text: result.text, changed: result.changed });
  }

  const componentList = [...components].sort();
  const needsInit = !hasComponentsJson(cwd);
  const initCommand = [...runner.dlx, "shadcn@latest", "init", "--base", options.base, "--yes"];
  const addCommand = componentList.length
    ? [...runner.dlx, "shadcn@latest", "add", ...componentList, "--yes"]
    : null;
  const prettierCommand = [...runner.exec, "prettier", "--write", ...options.target];
  const mui = muiDependencies(cwd);

  console.log("Package manager:", manager);
  console.log(`Files with changes: ${changedCount} of ${files.length}`);
  console.log(`Required shadcn components (${componentList.length}): ${componentList.join(" ") || "none"}`);
  console.log("");
  console.log("Planned steps:");
  console.log(`  1. ${needsInit ? initCommand.join(" ") : "shadcn already initialized (components.json present) - skipped"}`);
  console.log(`  2. ${addCommand ? addCommand.join(" ") : "no components to add"}`);
  console.log(`  3. codemod writes ${changedCount} file(s)`);
  console.log(`  4. ${prettierCommand.join(" ")}`);
  console.log("");

  if (options.dryRun) {
    console.log("Dry run (--dry-run): nothing executed.");
    printManual(manualTotals, mui, options.base);
    return 0;
  }

  if (needsInit) {
    console.log("> shadcn init");
    const status = run(initCommand, cwd);
    if (status !== 0) {
      console.error("shadcn init failed; aborting.");
      return status;
    }
  }

  if (addCommand) {
    console.log("> shadcn add");
    const status = run(addCommand, cwd);
    if (status !== 0) {
      console.error("shadcn add failed; aborting.");
      return status;
    }
  }

  console.log("> codemod writes files");
  for (const entry of planned) {
    if (!entry.changed) continue;
    writeFileSync(entry.path, entry.text);
    console.log(`  changed: ${relative(cwd, entry.path)}`);
  }

  console.log("> prettier");
  run(prettierCommand, cwd);

  printManual(manualTotals, mui, options.base);
  return 0;
}

function printManual(manualTotals: Map<string, number>, mui: string[], base: "radix" | "base"): void {
  console.log("");
  console.log("Still to do manually:");
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
