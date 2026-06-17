import { test } from "node:test";
import assert from "node:assert/strict";
import { Project } from "ts-morph";
import { sxFile } from "../src/sx.js";

function convert(source: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("Sx.tsx", source);
  return sxFile(file, source);
}

test("Box becomes div and sx spacing uses the 8px-to-4px conversion", () => {
  const result = convert(
    'import Box from "@mui/material/Box";\nexport const A = () => <Box sx={{ p: 2, mt: 1 }}>x</Box>;\n',
  );
  assert.match(result.text, /<div className="p-4 mt-2">x<\/div>/);
});

test("Responsive sx object produces breakpoint prefixes", () => {
  const result = convert(
    'import Box from "@mui/material/Box";\nexport const A = () => <Box sx={{ width: { xs: "100%", md: 200 } }}>x</Box>;\n',
  );
  assert.match(result.text, /className="w-full md:w-\[200px\]"/);
});

test("display flex and flexDirection become Tailwind classes", () => {
  const result = convert(
    'import Box from "@mui/material/Box";\nexport const A = () => <Box sx={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>x</Box>;\n',
  );
  assert.match(result.text, /flex/);
  assert.match(result.text, /flex-col/);
  assert.match(result.text, /gap-4/);
  assert.match(result.text, /items-center/);
});

test("Stack becomes div with flex flex-row and gap from spacing", () => {
  const result = convert(
    'import { Stack } from "@mui/material";\nexport const A = () => <Stack spacing={2} direction="row">x</Stack>;\n',
  );
  assert.match(result.text, /<div className="[^"]*">x<\/div>/);
  assert.match(result.text, /\bflex\b/);
  assert.match(result.text, /flex-row/);
  assert.match(result.text, /gap-4/);
  assert.doesNotMatch(result.text, /flex-col/);
});

test("Container becomes div with mx-auto and max-width", () => {
  const result = convert(
    'import { Container } from "@mui/material";\nexport const A = () => <Container maxWidth="lg">x</Container>;\n',
  );
  assert.match(result.text, /<div className="mx-auto w-full px-4 max-w-\[1200px\]">x<\/div>/);
});

test("bgcolor with a theme token becomes a bg class", () => {
  const result = convert(
    'import Box from "@mui/material/Box";\nexport const A = () => <Box sx={{ bgcolor: "primary.main", color: "text.secondary" }}>x</Box>;\n',
  );
  assert.match(result.text, /bg-primary/);
  assert.match(result.text, /text-muted-foreground/);
});

test("Unmappable sx properties remain in sx with a warning", () => {
  const result = convert(
    'import Box from "@mui/material/Box";\nexport const A = () => <Box sx={{ p: 2, transition: "all 0.2s" }}>x</Box>;\n',
  );
  assert.match(result.text, /p-4/);
  assert.match(result.text, /sx=\{\{ transition: "all 0.2s" \}\}/);
  assert.ok(result.warnings.some((warning) => warning.includes("sx")));
});

test("sx on an existing className is merged via cn", () => {
  const result = convert(
    'import Box from "@mui/material/Box";\nexport const A = () => <Box className={base} sx={{ p: 2 }}>x</Box>;\n',
  );
  assert.match(result.text, /className=\{cn\("p-4", base\)\}/);
  assert.equal(result.needsCn, true);
});

test("negative spacing produces a negative class", () => {
  const result = convert(
    'import Box from "@mui/material/Box";\nexport const A = () => <Box sx={{ mt: -2 }}>x</Box>;\n',
  );
  assert.match(result.text, /-mt-4/);
});

test("Grid container becomes a 12-col grid with gap; items become col-span", () => {
  const result = convert(
    'import { Grid } from "@mui/material";\nexport const A = () => (<Grid container spacing={2}><Grid item xs={12} md={6}>a</Grid></Grid>);\n',
  );
  assert.match(result.text, /<div className="grid gap-4 grid-cols-12">/);
  assert.match(result.text, /<div className="col-span-12 md:col-span-6">a<\/div>/);
});

test("Grid v6 size object maps to responsive col-span", () => {
  const result = convert(
    'import { Grid } from "@mui/material";\nexport const A = () => (<Grid container><Grid size={{ xs: 12, md: 6 }}>a</Grid></Grid>);\n',
  );
  assert.match(result.text, /<div className="grid grid-cols-12">/);
  assert.match(result.text, /<div className="col-span-12 md:col-span-6">a<\/div>/);
});

test("Grid offset maps to col-start", () => {
  const result = convert(
    'import { Grid } from "@mui/material";\nexport const A = () => <Grid size={6} offset={{ md: 2 }}>a</Grid>;\n',
  );
  assert.match(result.text, /col-span-6/);
  assert.match(result.text, /md:col-start-3/);
});

test("additional sx properties map to Tailwind v4 classes", () => {
  const result = convert(
    'import Box from "@mui/material/Box";\nexport const A = () => <Box sx={{ textTransform: "uppercase", objectFit: "cover", userSelect: "none", alignSelf: "center", letterSpacing: 2 }}>x</Box>;\n',
  );
  assert.match(result.text, /uppercase/);
  assert.match(result.text, /object-cover/);
  assert.match(result.text, /select-none/);
  assert.match(result.text, /self-center/);
  assert.match(result.text, /tracking-\[2px\]/);
});

test("extended color tokens map (success, grey)", () => {
  const result = convert(
    'import Box from "@mui/material/Box";\nexport const A = () => <Box sx={{ bgcolor: "success.main", color: "grey.700" }}>x</Box>;\n',
  );
  assert.match(result.text, /bg-green-600/);
  assert.match(result.text, /text-gray-700/);
});

test("gridColumn span maps to col-span", () => {
  const result = convert(
    'import Box from "@mui/material/Box";\nexport const A = () => <Box sx={{ gridColumn: "span 2" }}>x</Box>;\n',
  );
  assert.match(result.text, /col-span-2/);
});
