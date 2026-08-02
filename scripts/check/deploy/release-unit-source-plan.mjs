import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const TARGET_PATTERN = /^[a-z][a-z0-9-]*$/;
const LINTABLE_SOURCE_PATTERN = /\.(?:[cm]?[jt]s|[jt]sx)$/;

function normalizedPath(value) {
  return value.replaceAll(path.sep, "/").replace(/\/$/, "");
}

function compilerSourceRoot(cwd, project) {
  const projectDirectory = path.posix.dirname(project);
  if (projectDirectory !== ".") return projectDirectory;
  const config = JSON.parse(fs.readFileSync(path.join(cwd, project), "utf8"));
  const rootDirectory = config.compilerOptions?.rootDir;
  if (typeof rootDirectory !== "string" || !rootDirectory.trim()) {
    throw new Error(`root TypeScript project must declare compilerOptions.rootDir: ${project}`);
  }
  return normalizedPath(path.posix.normalize(path.posix.join(projectDirectory, rootDirectory)));
}

function containsLintableSource(root) {
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) continue;
    if (stat.isFile()) {
      if (LINTABLE_SOURCE_PATTERN.test(current)) return true;
      continue;
    }
    if (!stat.isDirectory()) continue;
    for (const entry of fs.readdirSync(current)) pending.push(path.join(current, entry));
  }
  return false;
}

function assertLintRoot(cwd, root) {
  const absolute = path.resolve(cwd, root);
  const relative = path.relative(path.resolve(cwd), absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`release lint root escapes the repository: ${root}`);
  }
  if (!fs.existsSync(absolute)) throw new Error(`release lint root is missing: ${root}`);
  if (!containsLintableSource(absolute)) {
    throw new Error(`release lint root has no lintable JavaScript/TypeScript source: ${root}`);
  }
  return root;
}

export function resolveReleaseUnitSourceClosure({ cwd = process.cwd(), targetId, graph } = {}) {
  if (!TARGET_PATTERN.test(targetId ?? "")) throw new Error(`invalid release validation target: ${targetId}`);
  if (!graph) {
    const require = createRequire(import.meta.url);
    const { resolveDeployGraph } = require("../../deploy/deploy-graph.ts");
    graph = resolveDeployGraph({ repositoryRoot: cwd });
  }
  const unit = graph.units.find((candidate) => candidate.id === targetId);
  if (!unit) throw new Error(`release validation target is not a deploy graph unit: ${targetId}`);

  const compilerPackageIds = unit.compilerProjects.flatMap((project) => {
    const match = project.match(/^packages\/([^/]+)\/tsconfig\.json$/);
    return match ? [match[1]] : [];
  });
  const generatedMirrorRoot = normalizedPath(unit.runtime.appRoot);
  const expectedGeneratedMirrorRoot = `apps/${unit.id}`;
  if (generatedMirrorRoot !== expectedGeneratedMirrorRoot) {
    throw new Error(
      `release lint may exclude only the generated deploy-unit mirror ${expectedGeneratedMirrorRoot}; received ${generatedMirrorRoot}`,
    );
  }
  const lintRoots = [...new Set([
    ...unit.privateSourceRoots.map(normalizedPath),
    ...unit.compilerProjects.map((project) => compilerSourceRoot(cwd, project)),
  ])].sort().map((root) => assertLintRoot(cwd, root));
  const privateNodeAreas = unit.privateSourceRoots.flatMap((root) => {
    const normalized = normalizedPath(root);
    if (normalized === "app" || normalized.startsWith("app/")) return ["app/__release-unit__"];
    const scriptArea = normalized.match(/^scripts\/([^/]+)(?:\/|$)/)?.[1];
    return scriptArea ? [`scripts/${scriptArea}/__release-unit__`] : [];
  });

  return {
    targetId: unit.id,
    lintRoots,
    generatedMirrorRoots: [generatedMirrorRoot],
    node: {
      affectedModules: [...new Set(compilerPackageIds)].sort(),
      changedFiles: [...new Set([
        ...privateNodeAreas,
        "app/__release-unit__",
        "scripts/check/__release-unit__",
        "scripts/deploy/__release-unit__",
      ])].sort(),
    },
    typecheckScopes: [...unit.checks.typecheckScopes],
  };
}
