import { test } from "node:test";
import assert from "node:assert/strict";
import { partitionInputs } from "../src/paths.js";

test("a single file input stays a file and adds no glob", () => {
  assert.deepEqual(partitionInputs(["src/Foo.tsx"]), { files: ["src/Foo.tsx"], globs: [] });
});

test("a directory input is globbed and excludes node_modules", () => {
  assert.deepEqual(partitionInputs(["src"]), {
    files: [],
    globs: ["src/**/*.{ts,tsx}", "!**/node_modules/**"],
  });
});

test("a trailing slash on a directory input is normalized", () => {
  assert.deepEqual(partitionInputs(["src/"]), {
    files: [],
    globs: ["src/**/*.{ts,tsx}", "!**/node_modules/**"],
  });
});

test("mixed inputs are split and the negative glob is added once", () => {
  assert.deepEqual(partitionInputs(["a.ts", "src", "b.tsx"]), {
    files: ["a.ts", "b.tsx"],
    globs: ["src/**/*.{ts,tsx}", "!**/node_modules/**"],
  });
});
