import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { applyTailwind, detectFramework, hasTailwind, planTailwind } from "../src/tailwind.js";

interface Files {
  [path: string]: string;
}

function project(files: Files): string {
  const dir = mkdtempSync(join(tmpdir(), "m2s-tw-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

const NEXT_PKG = JSON.stringify({ dependencies: { next: "15.0.0", react: "19.0.0" } });

test("a project that already has Tailwind is left untouched", () => {
  const dir = project({
    "package.json": JSON.stringify({ devDependencies: { tailwindcss: "^4.0.0" } }),
  });
  try {
    const plan = planTailwind(dir);
    assert.equal(plan.needed, false);
    assert.deepEqual(plan.install, []);
    assert.equal(plan.css, null);
    assert.equal(plan.postcssCreate, null);
  } finally {
    cleanup(dir);
  }
});

test("hasTailwind detects v3 as well", () => {
  assert.equal(hasTailwind({ devDependencies: { tailwindcss: "^3.4.0" } }), true);
  assert.equal(hasTailwind({ dependencies: {} }), false);
});

test("detectFramework recognizes next, vite, and other", () => {
  assert.equal(detectFramework({ dependencies: { next: "15" } }), "next");
  assert.equal(detectFramework({ devDependencies: { vite: "5" } }), "vite");
  assert.equal(detectFramework({ dependencies: { react: "19" } }), "other");
});

test("Next.js without Tailwind plans an install plus a CSS import and a postcss config", () => {
  const dir = project({
    "package.json": NEXT_PKG,
    "app/globals.css": "body { margin: 0; }\n",
  });
  try {
    const plan = planTailwind(dir);
    assert.equal(plan.needed, true);
    assert.equal(plan.framework, "next");
    assert.deepEqual(plan.install, ["tailwindcss", "@tailwindcss/postcss", "postcss"]);
    assert.deepEqual(plan.css, { path: "app/globals.css", exists: true });
    assert.equal(plan.postcssCreate, "postcss.config.mjs");
  } finally {
    cleanup(dir);
  }
});

test("applyTailwind prepends the import, creates postcss config, and is idempotent", () => {
  const dir = project({
    "package.json": NEXT_PKG,
    "app/globals.css": "body { margin: 0; }\n",
  });
  try {
    const plan = planTailwind(dir);
    const first = applyTailwind(plan, dir);
    assert.equal(first.cssAction, "added");
    assert.equal(first.postcssCreated, "postcss.config.mjs");

    const css = readFileSync(join(dir, "app/globals.css"), "utf8");
    assert.match(css, /^@import "tailwindcss";\nbody \{ margin: 0; \}/);

    const postcss = readFileSync(join(dir, "postcss.config.mjs"), "utf8");
    assert.match(postcss, /@tailwindcss\/postcss/);

    // Re-running must not duplicate the import or overwrite the config.
    const second = applyTailwind(plan, dir);
    assert.equal(second.cssAction, "present");
    assert.equal(second.postcssCreated, null);
    const cssAgain = readFileSync(join(dir, "app/globals.css"), "utf8");
    assert.equal(cssAgain.match(/@import "tailwindcss";/g)?.length, 1);
  } finally {
    cleanup(dir);
  }
});

test("a leading @charset stays the first rule", () => {
  const dir = project({
    "package.json": NEXT_PKG,
    "src/app/globals.css": '@charset "utf-8";\nbody { color: red; }\n',
  });
  try {
    const plan = planTailwind(dir);
    applyTailwind(plan, dir);
    const css = readFileSync(join(dir, "src/app/globals.css"), "utf8");
    assert.match(css, /^@charset "utf-8";\n@import "tailwindcss";\n/);
  } finally {
    cleanup(dir);
  }
});

test("with no stylesheet, a globals.css is created under the detected app dir", () => {
  const dir = project({ "package.json": NEXT_PKG });
  mkdirSync(join(dir, "src", "app"), { recursive: true });
  try {
    const plan = planTailwind(dir);
    assert.deepEqual(plan.css, { path: "src/app/globals.css", exists: false });
    assert.ok(plan.notes.some((note) => note.includes("import it from your root layout")));

    const applied = applyTailwind(plan, dir);
    assert.equal(applied.cssAction, "created");
    const css = readFileSync(join(dir, "src/app/globals.css"), "utf8");
    assert.equal(css, '@import "tailwindcss";\n');
  } finally {
    cleanup(dir);
  }
});

test("an existing postcss config without a Tailwind plugin is flagged, not overwritten", () => {
  const original = "export default { plugins: { autoprefixer: {} } };\n";
  const dir = project({
    "package.json": NEXT_PKG,
    "app/globals.css": "body {}\n",
    "postcss.config.mjs": original,
  });
  try {
    const plan = planTailwind(dir);
    assert.equal(plan.postcssCreate, null);
    assert.ok(plan.notes.some((note) => note.includes("@tailwindcss/postcss")));

    applyTailwind(plan, dir);
    assert.equal(readFileSync(join(dir, "postcss.config.mjs"), "utf8"), original);
  } finally {
    cleanup(dir);
  }
});

test("Vite without Tailwind notes the dedicated plugin alternative", () => {
  const dir = project({
    "package.json": JSON.stringify({ devDependencies: { vite: "5.0.0" } }),
    "src/index.css": ":root {}\n",
  });
  try {
    const plan = planTailwind(dir);
    assert.equal(plan.framework, "vite");
    assert.deepEqual(plan.css, { path: "src/index.css", exists: true });
    assert.ok(plan.notes.some((note) => note.includes("@tailwindcss/vite")));
  } finally {
    cleanup(dir);
  }
});
