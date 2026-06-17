#!/usr/bin/env node
import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { relative } from "node:path";
import { Project } from "ts-morph";
import { runMigration } from "./run.js";
import { collectSourceFiles } from "./paths.js";
import { runSetup } from "./setup.js";
import type { PackageManager } from "./setup.js";

function parseBase(value: string | undefined): "radix" | "base" {
  return value === "base" ? "base" : "radix";
}

function parsePackageManager(value: string | undefined): PackageManager | undefined {
  if (value === "pnpm" || value === "npm" || value === "yarn" || value === "bun") return value;
  return undefined;
}

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      write: { type: "boolean", default: false },
      report: { type: "boolean", default: false },
      "skip-sx": { type: "boolean", default: false },
      setup: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      base: { type: "string" },
      pm: { type: "string" },
    },
  });

  if (positionals.length === 0) {
    console.error(
      "Usage: mui-to-shadcn <path...> [--write] [--report] [--skip-sx] [--setup [--base radix|base] [--pm pnpm|npm|yarn|bun] [--dry-run]]",
    );
    process.exit(1);
  }

  const applySx = values["skip-sx"] !== true;
  const base = parseBase(values.base as string | undefined);

  if (values.setup === true) {
    const status = runSetup({
      target: positionals,
      base,
      packageManager: parsePackageManager(values.pm as string | undefined),
      dryRun: values["dry-run"] === true,
      skipSx: !applySx,
      cwd: process.cwd(),
    });
    process.exit(status);
  }

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    useInMemoryFileSystem: false,
  });

  const files = collectSourceFiles(project, positionals);
  if (files.length === 0) {
    console.error("No matching files found");
    process.exit(1);
  }

  const write = values.write === true;
  const report = values.report === true;

  let changedCount = 0;
  let warningCount = 0;
  const manualTotals = new Map<string, number>();
  const components = new Set<string>();

  for (const file of files) {
    const result = runMigration(file, { sx: applySx, base });
    const rel = relative(process.cwd(), file.getFilePath());
    warningCount += result.warnings.length;
    for (const slug of result.components) components.add(slug);
    for (const hit of result.manual) {
      manualTotals.set(hit.component, (manualTotals.get(hit.component) ?? 0) + 1);
    }

    if (result.changed) {
      changedCount += 1;
      if (write) {
        writeFileSync(file.getFilePath(), result.text);
        console.log(`changed: ${rel}`);
      } else {
        console.log(`would change: ${rel}`);
      }
    }

    if (report) {
      for (const warning of result.warnings) console.log(`  warning: ${warning}`);
      for (const hit of result.manual) {
        console.log(`  manual: line ${hit.line} <${hit.component}> ${hit.message}`);
      }
    }
  }

  console.log("");
  console.log(`Files checked: ${files.length}`);
  if (write) {
    console.log(`Files changed: ${changedCount}`);
  } else {
    console.log(`Files with changes: ${changedCount} (dry run, nothing written)`);
  }
  console.log(`Warnings: ${warningCount}`);

  const componentList = [...components].sort();
  if (componentList.length) {
    console.log(`Required shadcn components (${componentList.length}): ${componentList.join(" ")}`);
    console.log("Install: use --setup or manually: pnpm dlx shadcn@latest add " + componentList.join(" "));
  }

  if (manualTotals.size) {
    console.log("Migrate manually:");
    const sorted = [...manualTotals].sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sorted) console.log(`  ${name}: ${count}`);
  }

  if (!report && (warningCount > 0 || manualTotals.size > 0)) {
    console.log("Show details with --report");
  }
}

main();
