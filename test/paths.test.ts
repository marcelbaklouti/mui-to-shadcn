import { test } from "node:test";
import assert from "node:assert/strict";
import { partitionInputs } from "../src/paths.js";

const SRC_GLOB = "src/**/*.{ts,tsx,js,jsx,mjs,cjs}";

test("a single file input stays a file and adds no glob", () => {
  assert.deepEqual(partitionInputs(["src/Foo.tsx"]), { files: ["src/Foo.tsx"], globs: [] });
});

test("a .jsx / .js file input stays a file (legacy CRA/v4 codebases)", () => {
  assert.deepEqual(partitionInputs(["src/Foo.jsx", "src/Bar.js"]), {
    files: ["src/Foo.jsx", "src/Bar.js"],
    globs: [],
  });
});

test("a directory input is globbed and excludes node_modules", () => {
  assert.deepEqual(partitionInputs(["src"]), {
    files: [],
    globs: [SRC_GLOB, "!**/node_modules/**"],
  });
});

test("a trailing slash on a directory input is normalized", () => {
  assert.deepEqual(partitionInputs(["src/"]), {
    files: [],
    globs: [SRC_GLOB, "!**/node_modules/**"],
  });
});

test("mixed inputs are split and the negative glob is added once", () => {
  assert.deepEqual(partitionInputs(["a.ts", "src", "b.tsx"]), {
    files: ["a.ts", "b.tsx"],
    globs: [SRC_GLOB, "!**/node_modules/**"],
  });
});
