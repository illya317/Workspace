import { promises as fs } from "node:fs";
import path from "node:path";

const POLICY_PATH = "scripts/arch/source-code-analysis/operations-module-policy.json";

interface OperationsModuleDefinition {
  name: string;
  include: string[];
  allowedDependencies: string[];
}

interface OperationsModulePolicy {
  schemaVersion: 1;
  modules: OperationsModuleDefinition[];
}

export interface OperationsModuleViolation {
  kind: "ambiguous-owner" | "dependency-cycle" | "invalid-dependency" | "unregistered-file";
  path: string;
  detail: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function parseOperationsModulePolicy(value: unknown): OperationsModulePolicy {
  if (!isPlainObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.modules)) {
    throw new Error("[source-code-analysis] invalid operations module policy");
  }
  const modules = value.modules.map((candidate, index) => {
    if (!isPlainObject(candidate) || typeof candidate.name !== "string" || !Array.isArray(candidate.include)
      || !Array.isArray(candidate.allowedDependencies)
      || candidate.include.some((item) => typeof item !== "string")
      || candidate.allowedDependencies.some((item) => typeof item !== "string")) {
      throw new Error(`[source-code-analysis] invalid operations module at index ${index}`);
    }
    return {
      name: candidate.name,
      include: [...candidate.include] as string[],
      allowedDependencies: [...candidate.allowedDependencies] as string[],
    };
  });
  const names = modules.map((definition) => definition.name);
  if (new Set(names).size !== names.length) throw new Error("[source-code-analysis] duplicate operations module name");
  const known = new Set(names);
  for (const definition of modules) {
    if (definition.allowedDependencies.some((dependency) => !known.has(dependency) || dependency === definition.name)) {
      throw new Error(`[source-code-analysis] invalid dependency registration for operations/${definition.name}`);
    }
    if (JSON.stringify(definition.allowedDependencies) !== JSON.stringify([...definition.allowedDependencies].sort())) {
      throw new Error(`[source-code-analysis] operations/${definition.name} dependencies must be sorted`);
    }
  }
  return { schemaVersion: 1, modules };
}

function owners(policy: OperationsModulePolicy, file: string) {
  return policy.modules.filter((definition) => definition.include.some((entry) =>
    entry.endsWith("/") ? file.startsWith(entry) : file === entry));
}

function cycles(policy: OperationsModulePolicy) {
  const byName = new Map(policy.modules.map((definition) => [definition.name, definition]));
  const active: string[] = [];
  const visited = new Set<string>();
  const found = new Set<string>();
  function visit(name: string) {
    const index = active.indexOf(name);
    if (index >= 0) {
      found.add([...active.slice(index), name].join(" -> "));
      return;
    }
    if (visited.has(name)) return;
    active.push(name);
    for (const dependency of byName.get(name)?.allowedDependencies ?? []) visit(dependency);
    active.pop();
    visited.add(name);
  }
  for (const name of byName.keys()) visit(name);
  return [...found].sort();
}

function referencedReleaseFiles(file: string, text: string) {
  const references = new Set<string>();
  const sourcePattern = /(?:source\s+)?["']?\$SCRIPT_DIR\/(deploy\/[^"'\s]+)["']?/g;
  let match = sourcePattern.exec(text);
  while (match) {
    references.add(`ops/${match[1]}`);
    match = sourcePattern.exec(text);
  }
  if (file.endsWith(".mjs") || file.endsWith(".js") || file.endsWith(".ts")) {
    const importPattern = /(?:from\s+|import\s*\(\s*)["'](\.[^"']+)["']/g;
    match = importPattern.exec(text);
    while (match) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
      references.add(resolved);
      match = importPattern.exec(text);
    }
  }
  return [...references];
}

export async function analyzeOperationsModules(repositoryRoot: string, policyValue?: unknown) {
  const policy = parseOperationsModulePolicy(policyValue ?? JSON.parse(await fs.readFile(
    path.join(repositoryRoot, POLICY_PATH), "utf8",
  )) as unknown);
  const violations: OperationsModuleViolation[] = [];
  const governedFiles: string[] = [];
  async function visit(relativeDirectory: string) {
    for (const entry of await fs.readdir(path.join(repositoryRoot, relativeDirectory), { withFileTypes: true })) {
      const relative = `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) await visit(relative);
      else if (entry.isFile() && /\.(?:mjs|py|sh)$/.test(entry.name)) governedFiles.push(relative);
    }
  }
  await visit("ops/release");
  for (const file of [...new Set(governedFiles)].sort()) {
    const matches = owners(policy, file);
    if (matches.length === 0) violations.push({ kind: "unregistered-file", path: file, detail: "no module owner" });
    else if (matches.length > 1) violations.push({
      kind: "ambiguous-owner", path: file, detail: matches.map((definition) => definition.name).join(", "),
    });
  }
  for (const cycle of cycles(policy)) {
    violations.push({ kind: "dependency-cycle", path: POLICY_PATH, detail: cycle });
  }
  for (const definition of policy.modules) {
    for (const file of definition.include.filter((entry) => !entry.endsWith("/"))) {
      let text: string;
      try {
        text = await fs.readFile(path.join(repositoryRoot, file), "utf8");
      } catch {
        violations.push({ kind: "unregistered-file", path: file, detail: "registered file is missing" });
        continue;
      }
      for (const target of referencedReleaseFiles(file, text)) {
        const targetOwner = owners(policy, target);
        if (targetOwner.length !== 1 || targetOwner[0].name === definition.name) continue;
        if (!definition.allowedDependencies.includes(targetOwner[0].name)) {
          violations.push({
            kind: "invalid-dependency",
            path: file,
            detail: `${definition.name} -> ${targetOwner[0].name} (${target})`,
          });
        }
      }
    }
  }
  return { policy, violations };
}
