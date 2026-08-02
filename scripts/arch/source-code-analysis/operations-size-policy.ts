import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const POLICY_PATH = "scripts/arch/source-code-analysis/operations-size-policy.json";
const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".mjs", ".py", ".sh", ".ts"]);

interface OperationsSizePolicy {
  schemaVersion: 1;
  defaultMaxLines: number;
  legacyCaps: Record<string, number>;
}

export interface OperationsSizeViolation {
  path: string;
  lines: number;
  limit: number;
  kind: "new-oversized-file" | "legacy-growth";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function parseOperationsSizePolicy(value: unknown): OperationsSizePolicy {
  if (!isPlainObject(value) || value.schemaVersion !== 1 || !Number.isSafeInteger(value.defaultMaxLines)
    || Number(value.defaultMaxLines) < 100 || !isPlainObject(value.legacyCaps)) {
    throw new Error("[source-code-analysis] invalid operations size policy");
  }
  const legacyCaps: Record<string, number> = {};
  for (const [file, cap] of Object.entries(value.legacyCaps)) {
    if (!file.startsWith("ops/") || !SOURCE_EXTENSIONS.has(path.extname(file))
      || !Number.isSafeInteger(cap) || Number(cap) <= Number(value.defaultMaxLines)) {
      throw new Error(`[source-code-analysis] invalid operations legacy cap: ${file}`);
    }
    legacyCaps[file] = Number(cap);
  }
  const sorted = Object.keys(legacyCaps).sort();
  if (JSON.stringify(Object.keys(value.legacyCaps)) !== JSON.stringify(sorted)) {
    throw new Error("[source-code-analysis] operations legacy caps must be sorted");
  }
  return { schemaVersion: 1, defaultMaxLines: Number(value.defaultMaxLines), legacyCaps };
}

async function sourceFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(directory: string) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        result.push(path.relative(root, absolute).split(path.sep).join("/"));
      }
    }
  }
  await visit(path.join(root, "ops"));
  return result.sort();
}

function physicalLines(text: string) {
  if (text.length === 0) return 0;
  const parts = text.split(/\r?\n/);
  return text.endsWith("\n") ? parts.length - 1 : parts.length;
}

export async function analyzeOperationsSize(repositoryRoot: string, policyValue?: unknown) {
  const policy = parseOperationsSizePolicy(policyValue ?? JSON.parse(await fs.readFile(
    path.join(repositoryRoot, POLICY_PATH), "utf8",
  )) as unknown);
  const violations: OperationsSizeViolation[] = [];
  const files = await sourceFiles(repositoryRoot);
  for (const file of files) {
    const lines = physicalLines(await fs.readFile(path.join(repositoryRoot, file), "utf8"));
    const limit = policy.legacyCaps[file] ?? policy.defaultMaxLines;
    if (lines <= limit) continue;
    violations.push({
      path: file,
      lines,
      limit,
      kind: Object.hasOwn(policy.legacyCaps, file) ? "legacy-growth" : "new-oversized-file",
    });
  }
  return { policy, checkedFiles: files.length, violations };
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 2 || argv[0] !== "--repository" || !argv[1]) {
    throw new Error("usage: operations-size-policy.ts --repository ROOT");
  }
  const repositoryRoot = path.resolve(argv[1]);
  const result = await analyzeOperationsSize(repositoryRoot);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.violations.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
