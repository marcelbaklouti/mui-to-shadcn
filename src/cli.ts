#!/usr/bin/env node
import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { relative, join } from "node:path";
import { createRequire } from "node:module";
import { Project } from "ts-morph";
import { runMigration } from "./run.js";
import { collectSourceFiles } from "./paths.js";
import { runSetup } from "./setup.js";
import type { PackageManager } from "./setup.js";
import { buildMigrationDoc } from "./migration-doc.js";
import type { FileReport } from "./migration-doc.js";

function parseBase(value: string | undefined): "radix" | "base" {
  return value === "base" ? "base" : "radix";
}

function parsePackageManager(value: string | undefined): PackageManager | undefined {
  if (value === "pnpm" || value === "npm" || value === "yarn" || value === "bun") return value;
  return undefined;
}

const KNOWN_STYLES = new Set(["vega", "nova", "maia", "lyra", "mira"]);

function parseStyle(value: string | undefined): string {
  if (value && KNOWN_STYLES.has(value)) return value;
  // Unknown but explicit styles are passed through (forward-compatible); default is vega.
  return value?.trim() || "vega";
}

function readVersion(): string {
  try {
    const pkg = createRequire(import.meta.url)("../package.json") as { version?: string };
    return pkg.version ?? "";
  } catch {
    return "";
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      write: { type: "boolean", default: false },
      report: { type: "boolean", default: false },
      md: { type: "boolean", default: false },
      "skip-sx": { type: "boolean", default: false },
      setup: { type: "boolean", default: false },
      "skip-tailwind": { type: "boolean", default: false },
      "skip-md": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      base: { type: "string" },
      style: { type: "string" },
      preset: { type: "string" },
      pm: { type: "string" },
    },
  });

  if (positionals.length === 0) {
    // Bare `npx mui-to-shadcn` on a terminal launches the guided wizard.
    if (process.stdin.isTTY && process.stdout.isTTY) {
      const { runWizard } = await import("./wizard.js");
      process.exit(await runWizard(process.cwd()));
    }
    console.error(
      "Usage: mui-to-shadcn <path...> [--write] [--report] [--md] [--skip-sx]\n" +
        "       [--setup [--base radix|base] [--style vega|nova|maia|lyra|mira] [--preset <name|code>]\n" +
        "                [--pm pnpm|npm|yarn|bun] [--skip-tailwind] [--skip-md] [--dry-run]]\n" +
        "\n" +
        "Run with no path in a terminal to start the interactive wizard.",
    );
    process.exit(1);
  }

  const applySx = values["skip-sx"] !== true;
  const base = parseBase(values.base as string | undefined);

  if (values.setup === true) {
    const status = runSetup({
      target: positionals,
      base,
      style: parseStyle(values.style as string | undefined),
      preset: (values.preset as string | undefined)?.trim() || undefined,
      packageManager: parsePackageManager(values.pm as string | undefined),
      dryRun: values["dry-run"] === true,
      skipSx: !applySx,
      skipTailwind: values["skip-tailwind"] === true,
      writeMd: values["skip-md"] !== true,
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
  const md = values.md === true;

  let changedCount = 0;
  let warningCount = 0;
  const manualTotals = new Map<string, number>();
  const components = new Set<string>();
  const reports: FileReport[] = [];

  for (const file of files) {
    const result = runMigration(file, { sx: applySx, base });
    const rel = relative(process.cwd(), file.getFilePath());
    warningCount += result.warnings.length;
    for (const slug of result.components) components.add(slug);
    for (const hit of result.manual) {
      manualTotals.set(hit.component, (manualTotals.get(hit.component) ?? 0) + 1);
    }
    if (result.manual.length || result.warnings.length) {
      reports.push({ file: rel, manual: result.manual, warnings: result.warnings });
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

  if (md) {
    const doc = buildMigrationDoc({
      files: reports,
      components: componentList,
      base,
      version: readVersion(),
      generatedAt: new Date().toISOString().slice(0, 10),
    });
    writeFileSync(join(process.cwd(), "MIGRATION.md"), doc);
    const taskTotal = reports.reduce((sum, r) => sum + r.manual.length, 0);
    const reviewTotal = reports.reduce((sum, r) => sum + r.warnings.length, 0);
    console.log("");
    console.log(
      `Wrote MIGRATION.md (${taskTotal} task${taskTotal === 1 ? "" : "s"}, ` +
        `${reviewTotal} review note${reviewTotal === 1 ? "" : "s"} across ` +
        `${reports.length} file${reports.length === 1 ? "" : "s"}).`,
    );
    console.log('Hand it to the LLM of your choice: "Read MIGRATION.md and complete the migration tasks it lists."');
  } else if (warningCount > 0 || manualTotals.size > 0) {
    console.log("Write an LLM-ready handoff with --md (MIGRATION.md).");
  }

  if (!report && (warningCount > 0 || manualTotals.size > 0)) {
    console.log("Show details with --report");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
