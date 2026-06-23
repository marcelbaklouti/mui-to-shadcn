import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { planSetup } from "../src/setup.js";
import type { SetupOptions } from "../src/setup.js";
import { runWizard } from "../src/wizard.js";

interface Files {
  [path: string]: string;
}

// planSetup resolves the target glob against process.cwd() (which equals options.cwd in
// the real CLI), so we chdir into a throwaway project for the duration of the callback.
function inProject<T>(files: Files, run: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "m2s-setup-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return run(dir);
  } finally {
    process.chdir(previous);
    rmSync(dir, { recursive: true, force: true });
  }
}

const NEXT_PKG = JSON.stringify({ dependencies: { next: "15.0.0", "@mui/material": "^6.0.0" } });
const BUTTON_TSX =
  'import { Button } from "@mui/material";\nexport const A = () => <Button variant="contained">Go</Button>;\n';

function baseOptions(dir: string, overrides: Partial<SetupOptions> = {}): SetupOptions {
  return {
    target: ["src"],
    base: "radix",
    style: "vega",
    preset: undefined,
    packageManager: undefined,
    dryRun: false,
    skipSx: false,
    skipTailwind: false,
    writeMd: true,
    cwd: dir,
    ...overrides,
  };
}

// Autocomplete has no shadcn equivalent, so the codemod leaves a manual task — exactly
// what the MIGRATION.md handoff is meant to capture.
const AUTOCOMPLETE_TSX =
  'import { Autocomplete } from "@mui/material";\nexport const A = () => <Autocomplete options={[]} renderInput={() => null} />;\n';

test("planSetup passes style as preset and base separately to shadcn init", () => {
  inProject(
    { "package.json": NEXT_PKG, "package-lock.json": "", "src/A.tsx": BUTTON_TSX, "src/app/globals.css": "body{}" },
    (dir) => {
      const result = planSetup(baseOptions(dir));
      assert.equal(result.ok, true);
      if (!result.ok) return;
      const plan = result.plan;
      assert.equal(plan.preset, "vega");
      assert.deepEqual(plan.initCommand, [
        "npx",
        "-y",
        "shadcn@latest",
        "init",
        "--base",
        "radix",
        "--preset",
        "vega",
        "--yes",
      ]);
      assert.ok(plan.componentList.includes("button"));
      assert.equal(plan.manager, "npm");
      assert.equal(plan.tailwind.needed, true);
      assert.ok(plan.steps[0]?.includes("tailwindcss"));
    },
  );
});

test("planSetup passes --base base with style preset (mira)", () => {
  inProject({ "package.json": NEXT_PKG, "src/A.tsx": BUTTON_TSX }, (dir) => {
    const result = planSetup(baseOptions(dir, { base: "base", style: "mira" }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.preset, "mira");
    assert.deepEqual(result.plan.initCommand, [
      "pnpm",
      "dlx",
      "shadcn@latest",
      "init",
      "--base",
      "base",
      "--preset",
      "mira",
      "--yes",
    ]);
  });
});

test("planSetup lets a raw preset override style but still passes --base", () => {
  inProject({ "package.json": NEXT_PKG, "src/A.tsx": BUTTON_TSX }, (dir) => {
    const result = planSetup(baseOptions(dir, { base: "radix", style: "vega", preset: "a2r6bw" }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.preset, "a2r6bw");
    assert.deepEqual(result.plan.initCommand, [
      "pnpm",
      "dlx",
      "shadcn@latest",
      "init",
      "--base",
      "radix",
      "--preset",
      "a2r6bw",
      "--yes",
    ]);
  });
});

test("planSetup plans a MIGRATION.md handoff when manual work remains", () => {
  inProject({ "package.json": NEXT_PKG, "src/A.tsx": AUTOCOMPLETE_TSX }, (dir) => {
    const result = planSetup(baseOptions(dir));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const plan = result.plan;
    assert.equal(plan.writeMd, true);
    assert.ok(plan.mdTasks >= 1, "Autocomplete should produce at least one manual task");
    assert.ok(plan.reports.some((r) => r.manual.some((m) => m.component === "Autocomplete")));
    assert.ok(plan.steps.some((s) => s.includes("MIGRATION.md")));
  });
});

test("planSetup omits MIGRATION.md when writeMd is false (--skip-md)", () => {
  inProject({ "package.json": NEXT_PKG, "src/A.tsx": AUTOCOMPLETE_TSX }, (dir) => {
    const result = planSetup(baseOptions(dir, { writeMd: false }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.writeMd, false);
    assert.ok(!result.plan.steps.some((s) => s.includes("MIGRATION.md")));
  });
});

test("planSetup skips init and Tailwind when components.json already exists", () => {
  inProject(
    { "package.json": NEXT_PKG, "components.json": "{}", "src/A.tsx": BUTTON_TSX },
    (dir) => {
      const result = planSetup(baseOptions(dir));
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.plan.needsInit, false);
      assert.equal(result.plan.initCommand, null);
      assert.equal(result.plan.tailwind.needed, false);
      assert.equal(result.plan.tailwindCommand, null);
    },
  );
});

test("planSetup reports an error when no source files match", () => {
  inProject({ "package.json": NEXT_PKG }, (dir) => {
    const result = planSetup(baseOptions(dir));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /No \.ts\/\.tsx files found/);
  });
});

test("the wizard module loads (imports @clack/prompts cleanly)", () => {
  assert.equal(typeof runWizard, "function");
});
