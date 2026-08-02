import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export { taskGraphDigest, taskReceiptDigest } from "./task-proof-contract.mjs";
import { checkTaskInputContract } from "./check-task-contracts.mjs";

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const COMMON_CONTRACT_FILES = [
  ".node-version",
  "package.json",
  "package-lock.json",
  "scripts/check/check-task-contracts.mjs",
  "scripts/check/check-task-inputs.mjs",
  "scripts/check/check-task-cache.mjs",
  "scripts/check/run-check-suite.mjs",
  "scripts/check/with-check-lock.js",
];
const SOURCE_EXTENSIONS = ["", ".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json"];
const ISOLATED_TEST_FILESYSTEM_MARKER = "workspace-test-filesystem: isolated";
const CANONICAL_REGISTRY_ENTRIES = [
  "packages/platform/module-registry.ts",
  "scripts/deploy/deploy-unit-spec.ts",
];
const GLOBAL_INPUT_PREFIXES = [
  "generated/prisma/",
  "ops/",
  "packages/core/",
  "packages/platform/",
  "prisma/",
  "scripts/",
];
const GLOBAL_INPUT_FILES = new Set([
  ".node-version",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "tsconfig.base.json",
  "tsconfig.app.json",
  "tsconfig.tooling.json",
  "tsconfig.prisma-client.json",
]);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function semanticNodeOptions(value) {
  return String(value ?? "")
    .replace(/(?:^|\s)--max[-_]old[-_]space[-_]size(?:=\S+|\s+\S+)/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function trackedFiles(cwd) {
  const result = spawnSync("git", ["ls-files", "-z"], { cwd, encoding: "buffer" });
  if (result.error || result.status !== 0) {
    throw new Error(`cannot enumerate task inputs: ${result.error?.message ?? result.stderr?.toString("utf8").trim() ?? "git ls-files failed"}`);
  }
  return result.stdout.toString("utf8").split("\0").filter(Boolean).sort();
}

function existingRelative(cwd, candidate) {
  const normalized = path.posix.normalize(candidate.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) return null;
  const absolute = path.join(cwd, normalized);
  return fs.existsSync(absolute) ? normalized : null;
}

function resolveRelativeImport(cwd, importer, request) {
  if (!request.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(importer), request));
  for (const suffix of SOURCE_EXTENSIONS) {
    const candidate = existingRelative(cwd, `${base}${suffix}`);
    if (candidate && fs.statSync(path.join(cwd, candidate)).isFile()) return candidate;
  }
  for (const suffix of SOURCE_EXTENSIONS.slice(1)) {
    const candidate = existingRelative(cwd, path.posix.join(base, `index${suffix}`));
    if (candidate && fs.statSync(path.join(cwd, candidate)).isFile()) return candidate;
  }
  return null;
}

function sourceReferences(cwd, relativeFile) {
  const absolute = path.join(cwd, relativeFile);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return [];
  if (!/\.(?:[cm]?[jt]s|[jt]sx)$/.test(relativeFile)) return [];
  const content = fs.readFileSync(absolute, "utf8");
  const requests = new Set();
  const referencePatterns = [
    /\bimport\s*["']([^"']+)["']/g,
    /\b(?:import|export)\s+(?:type\s+)?[\w$*\s{},]+?\s+from\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of referencePatterns) {
    for (const match of content.matchAll(pattern)) requests.add(match[1]);
  }
  return [...requests].map((request) => resolveRelativeImport(cwd, relativeFile, request)).filter(Boolean);
}

function sourceImportClosure(cwd, entryFiles) {
  const closure = new Set();
  const pending = [...entryFiles];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || closure.has(current)) continue;
    closure.add(current);
    for (const dependency of sourceReferences(cwd, current)) pending.push(dependency);
  }
  return closure;
}

export function classifyTaskInputPath(value) {
  const file = String(value ?? "").trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (!file || file.startsWith("/") || file.includes("//") || file.split("/").includes("..")) {
    throw new Error(`task input path is not repository-relative: ${value ?? "<empty>"}`);
  }
  if (GLOBAL_INPUT_FILES.has(file) || GLOBAL_INPUT_PREFIXES.some((prefix) => file.startsWith(prefix))) {
    return { kind: "global", owner: null };
  }
  const packageMatch = file.match(/^packages\/([a-z][a-z0-9-]*)\//);
  if (packageMatch) return { kind: "owner", owner: packageMatch[1] };
  const moduleMatch = file.match(/^app\/\(modules\)\/([a-z][a-z0-9-]*)\//);
  if (moduleMatch) return { kind: "owner", owner: moduleMatch[1] };
  const apiMatch = file.match(/^app\/api\/modules\/([a-z][a-z0-9-]*)\//);
  if (apiMatch) return { kind: "owner", owner: apiMatch[1] };
  const appMatch = file.match(/^apps\/([a-z][a-z0-9-]*)\//);
  if (appMatch) return { kind: "owner", owner: appMatch[1] };
  throw new Error(`task input path has no canonical global or owner classification: ${file}`);
}

function ownerSliceRoots(owner) {
  if (!/^[a-z][a-z0-9-]*$/.test(owner)) throw new Error(`invalid task input owner: ${owner}`);
  return [
    `packages/${owner}`,
    `app/(modules)/${owner}`,
    `app/api/modules/${owner}`,
    `apps/${owner}`,
  ];
}

function assertCanonicalOwner(cwd, taskId, owner) {
  const registry = CANONICAL_REGISTRY_ENTRIES[0];
  const registryPath = path.join(cwd, registry);
  if (!fs.existsSync(registryPath)) {
    throw new Error(`task ${taskId} cannot resolve owner ${owner}; canonical registry is missing: ${registry}`);
  }
  const source = fs.readFileSync(registryPath, "utf8");
  if (!source.includes(`@workspace/${owner}`)) {
    throw new Error(`task ${taskId} references owner absent from canonical registry: ${owner}`);
  }
}

function commandEntryFiles(cwd, task) {
  const candidates = [task.command, ...task.args]
    .map((value) => String(value).replace(/^\.\//, ""))
    .filter((value) => /\.(?:[cm]?[jt]s|[jt]sx|sh|py)$/.test(value));
  return candidates.map((candidate) => existingRelative(cwd, candidate)).filter(Boolean);
}

function tsconfigPath(cwd, project) {
  const relative = project.endsWith(".json") ? project : path.posix.join(project, "tsconfig.json");
  const existing = existingRelative(cwd, relative);
  if (!existing) throw new Error(`TypeScript project config is missing: ${relative}`);
  return existing;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function typescriptProjectInputs(cwd, project, allFiles) {
  const files = new Set(["tsconfig.base.json"]);
  const roots = new Set();
  const visited = new Set();
  const visit = (projectValue) => {
    const config = tsconfigPath(cwd, projectValue);
    if (visited.has(config)) return;
    visited.add(config);
    files.add(config);
    const parsed = readJson(path.join(cwd, config));
    const directory = path.posix.dirname(config);
    if (config === "tsconfig.app.json") {
      roots.add("app");
      for (const item of ["instrumentation.ts", "next-env.d.ts", "next.config.ts"]) files.add(item);
    } else if (config === "tsconfig.tooling.json") {
      for (const root of ["scripts", "e2e"]) roots.add(root);
      for (const item of ["next.config.ts", "playwright.config.ts", "prisma.config.ts"]) files.add(item);
    } else if (config === "tsconfig.prisma-client.json") {
      roots.add("generated/prisma");
    } else if (directory !== ".") {
      roots.add(directory);
    }
    for (const reference of parsed.references ?? []) {
      const referenced = path.posix.normalize(path.posix.join(directory, reference.path));
      visit(referenced);
    }
  };
  visit(project);
  for (const file of allFiles) {
    if ([...roots].some((root) => file === root || file.startsWith(`${root}/`))) files.add(file);
  }
  return files;
}

function literalFilesystemInputs(cwd, testFiles, allFiles) {
  const selected = new Set(testFiles);
  for (const testFile of testFiles) {
    const content = fs.readFileSync(path.join(cwd, testFile), "utf8");
    if (content.split(/\r?\n/, 1)[0].trim() === `// ${ISOLATED_TEST_FILESYSTEM_MARKER}`) {
      if (/(?:\bprocess\.cwd\(\)|\bimport\.meta\.dirname\b|\b__dirname\b|\brepositoryRoot\b|\bREPOSITORY_ROOT\b)/.test(content)) {
        throw new Error(`isolated filesystem test references the live repository: ${testFile}`);
      }
      continue;
    }
    for (const match of content.matchAll(/["']((?:app|apps|docs|e2e|generated|ops|packages|prisma|public|scripts)\/[A-Za-z0-9_./\[\]-]+)["']/g)) {
      const value = path.posix.normalize(match[1]);
      const absolute = path.join(cwd, value);
      if (!fs.existsSync(absolute)) continue;
      if (fs.statSync(absolute).isDirectory()) {
        for (const file of allFiles) if (file.startsWith(`${value}/`)) selected.add(file);
      } else selected.add(value);
    }
  }
  return selected;
}

function nodeTestShardInputs(cwd, contract, allFiles) {
  const files = literalFilesystemInputs(cwd, contract.testFiles, allFiles);
  const first = contract.testFiles[0] ?? "";
  const packageMatch = first.match(/^packages\/([^/]+)\//);
  if (packageMatch) {
    for (const file of typescriptProjectInputs(cwd, `packages/${packageMatch[1]}`, allFiles)) files.add(file);
  } else if (first.startsWith("app/")) {
    for (const file of typescriptProjectInputs(cwd, "tsconfig.app.json", allFiles)) files.add(file);
  } else if (first.startsWith("ops/")) {
    for (const file of allFiles) if (file.startsWith("ops/")) files.add(file);
  } else if (first.startsWith("scripts/")) {
    const relative = first.slice("scripts/".length);
    const area = relative.includes("/") ? relative.split("/")[0] : null;
    for (const file of allFiles) {
      if (area ? file.startsWith(`scripts/${area}/`) : /^scripts\/[^/]+$/.test(file)) files.add(file);
    }
  }
  return new Set([...files, ...sourceImportClosure(cwd, contract.testFiles)]);
}

function selectContractFiles(cwd, task, contract, allFiles) {
  if (contract.kind === "typescript-project") return { files: typescriptProjectInputs(cwd, contract.project, allFiles), inventory: new Set() };
  if (contract.kind === "node-test-shard") return { files: nodeTestShardInputs(cwd, contract, allFiles), inventory: new Set() };
  const selected = new Set(contract.files ?? []);
  const inventory = new Set();
  for (const owner of contract.owners ?? []) {
    assertCanonicalOwner(cwd, task.id, owner);
    const roots = ownerSliceRoots(owner);
    if (!roots.some((root) => fs.existsSync(path.join(cwd, root)))) {
      throw new Error(`task ${task.id} references unknown owner slice: ${owner}`);
    }
    for (const entry of CANONICAL_REGISTRY_ENTRIES) selected.add(entry);
    for (const file of allFiles) {
      if (roots.some((root) => file === root || file.startsWith(`${root}/`))) selected.add(file);
    }
  }
  for (const file of allFiles) {
    if ((contract.roots ?? []).some((root) => file === root || file.startsWith(`${root}/`))) {
      selected.add(file);
    }
    if ((contract.patterns ?? []).some((pattern) => new RegExp(pattern).test(file))) {
      selected.add(file);
    }
    for (const pattern of contract.inventoryPatterns ?? []) {
      if (new RegExp(pattern).test(file)) {
        selected.add(file);
        inventory.add(file);
      }
    }
  }
  const detectorClosure = sourceImportClosure(cwd, contract.detectors ?? []);
  for (const file of detectorClosure) selected.add(file);
  const commandClosure = contract.commandClosure === false
    ? new Set()
    : sourceImportClosure(cwd, commandEntryFiles(cwd, task));
  for (const file of commandClosure) selected.add(file);
  for (const file of selected) {
    if ((contract.files ?? []).includes(file) || detectorClosure.has(file) || commandClosure.has(file)) inventory.delete(file);
  }
  return { files: selected, inventory };
}

function hashFiles(cwd, relativeFiles, inventory = new Set()) {
  const hash = crypto.createHash("sha256");
  let count = 0;
  for (const relative of [...relativeFiles].sort()) {
    const absolute = path.join(cwd, relative);
    if (!fs.existsSync(absolute)) {
      hash.update(`missing\0${relative}\0`);
      continue;
    }
    const stat = fs.lstatSync(absolute);
    hash.update(`${stat.isSymbolicLink() ? "link" : "file"}\0${relative}\0`);
    const mode = inventory.has(relative) ? "inventory" : "raw";
    hash.update(`${mode}\0`);
    if (stat.isSymbolicLink()) hash.update(fs.readlinkSync(absolute));
    else if (mode === "raw") hash.update(fs.readFileSync(absolute));
    hash.update("\0");
    count += 1;
  }
  return { digest: hash.digest("hex"), count };
}

function databaseConnectionCategory(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return {
      protocol: url.protocol,
      location: ["127.0.0.1", "localhost", "::1"].includes(hostname) ? "loopback" : "remote",
      port: url.port || "default",
      database: url.pathname.replace(/^\//, "") || null,
      schema: url.searchParams.get("schema"),
    };
  } catch {
    return { invalidValueDigest: digest(value) };
  }
}

function hashEnvironment(keys, env, valueMode = "full") {
  const values = Object.fromEntries([...new Set(keys ?? [])].sort().map((key) => [
    key,
    valueMode === "database-category" ? databaseConnectionCategory(env[key]) : env[key] ?? null,
  ]));
  return { digest: digest(canonical(values)), keys: Object.keys(values) };
}

export function captureCheckTaskInput(task, {
  cwd = process.cwd(),
  env = process.env,
  runtime = { node: process.versions.node, platform: process.platform, arch: process.arch },
} = {}) {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(task.id)) throw new Error(`task key is not portable: ${task.id}`);
  const contract = checkTaskInputContract(task);
  const allFiles = trackedFiles(cwd);
  const selected = selectContractFiles(cwd, task, contract, allFiles);
  for (const common of COMMON_CONTRACT_FILES) {
    selected.files.add(common);
    selected.inventory.delete(common);
  }
  const fileFacts = hashFiles(cwd, selected.files, selected.inventory);
  const environmentFacts = hashEnvironment(contract.environment, env, contract.environmentValueMode);
  const commandDigest = digest(canonical({
    taskKey: task.id,
    taskContractVersion: contract.version,
    command: task.command,
    args: task.args,
    severity: task.severity ?? "blocking",
    reusableWarning: task.reusableWarning === true,
  }));
  const runtimeDigest = digest(canonical({
    ...runtime,
    nodeOptions: semanticNodeOptions(env.NODE_OPTIONS),
  }));
  const inputDigest = digest(canonical({
    taskContractVersion: contract.version,
    kind: contract.kind,
    fileDigest: fileFacts.digest,
    environmentDigest: environmentFacts.digest,
  }));
  if (![inputDigest, commandDigest, runtimeDigest].every((value) => DIGEST_PATTERN.test(value))) {
    throw new Error(`task ${task.id} input digest calculation failed`);
  }
  return {
    taskKey: task.id,
    taskContractVersion: contract.version,
    inputDigest,
    commandDigest,
    runtimeDigest,
    inputSummary: {
      kind: contract.kind,
      fileCount: fileFacts.count,
      environmentKeys: environmentFacts.keys,
    },
  };
}
