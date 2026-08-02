import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const GENERATOR_PATH = path.join(ROOT, "scripts/generate-core-ui-surface-contracts.ts");
const LEGACY_ARTIFACT_PATH = path.join(
  ROOT,
  "packages/core/ui/registry/generated-surface-contracts.ts",
);
const GENERATED_DATA_PATH = path.join(ROOT, "docs/generated/core-ui-surface-contracts.json");
const MAX_GENERATED_ARTIFACT_BYTES = 2 * 1024 * 1024;
const MAX_GENERATED_LINE_BYTES = 16 * 1024;
const SOURCE_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const SOURCE_ROOTS = ["app", "packages", "lib", "server"];
const EXPECTED_SURFACES = [
  "BodySurface", "CreateSurface", "DataSurface", "DocumentSurface", "FormSurface",
  "InputSurface", "PageSurface", "PaperInputSurface", "SelectorSurface", "VisualizationSurface",
];

function sourceFiles(directory: string, files: string[] = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".cache", ".next", "node_modules"].includes(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) sourceFiles(absolutePath, files);
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(absolutePath);
  }
  return files;
}

test("Core UI surface contracts are reproducible generated data, not Core source", () => {
  assert.equal(fs.existsSync(LEGACY_ARTIFACT_PATH), false, "legacy generated TypeScript source must stay deleted");
  const output = fs.readFileSync(GENERATED_DATA_PATH, "utf8");
  assert.ok(Buffer.byteLength(output) <= MAX_GENERATED_ARTIFACT_BYTES, "generated data exceeds its 2 MiB budget");
  const longestLineBytes = Math.max(...output.split("\n").map((line) => Buffer.byteLength(line)));
  assert.ok(longestLineBytes <= MAX_GENERATED_LINE_BYTES, `generated data has a ${longestLineBytes}-byte line`);

  const parsed = JSON.parse(output) as { schemaVersion?: unknown; surfaces?: Record<string, unknown> };
  assert.equal(parsed.schemaVersion, 1);
  assert.deepEqual(Object.keys(parsed.surfaces ?? {}).sort(), EXPECTED_SURFACES);

  const check = spawnSync(
    process.execPath,
    ["--import", "tsx", GENERATOR_PATH, "--check"],
    { cwd: ROOT, encoding: "utf8" },
  );
  assert.equal(check.status, 0, check.stderr || check.stdout);
});

test("runtime source does not depend on the deleted generated TypeScript module", () => {
  const moduleReference = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'][^"']*generated-surface-contracts(?:\.[cm]?[jt]sx?)?["']/;
  const consumers = SOURCE_ROOTS
    .flatMap((relativeRoot) => sourceFiles(path.join(ROOT, relativeRoot)))
    .filter((file) => {
      const source = fs.readFileSync(file, "utf8");
      return moduleReference.test(source) || /\bgeneratedCoreUiSurfaceContracts\b/.test(source);
    })
    .map((file) => path.relative(ROOT, file).replaceAll(path.sep, "/"))
    .sort();

  assert.deepEqual(
    consumers,
    [],
    "runtime source must not depend on the retired generated TypeScript contract module",
  );
});
