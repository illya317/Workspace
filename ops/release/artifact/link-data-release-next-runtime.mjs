#!/usr/bin/env node

import { createRequire } from "node:module";
import { lstatSync, mkdirSync, readdirSync, realpathSync, symlinkSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function pathExists(value) {
  try { lstatSync(value); return true; }
  catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function findNextRuntimes(root) {
  const results = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile() && entry.name === "package.json" && path.basename(path.dirname(entryPath)) === "next"
        && path.basename(path.dirname(path.dirname(entryPath))) === "node_modules") results.push(path.dirname(entryPath));
    }
  }
  visit(root);
  return results.sort();
}

export function linkDataReleaseNextRuntime(standaloneRoot) {
  const root = realpathSync(path.resolve(standaloneRoot));
  const candidates = findNextRuntimes(root);
  if (candidates.length !== 1 || !inside(root, candidates[0])) {
    throw new Error(`data release artifact requires exactly one internal Next runtime; found ${candidates.length}`);
  }
  const releaseNodeModules = path.join(root, "node_modules");
  const releaseNext = path.join(releaseNodeModules, "next");
  mkdirSync(releaseNodeModules, { recursive: true });
  if (pathExists(releaseNext)) {
    if (realpathSync(releaseNext) !== realpathSync(candidates[0])) throw new Error("data release Next runtime target conflicts with traced runtime");
  } else {
    symlinkSync(path.relative(releaseNodeModules, candidates[0]), releaseNext);
  }
  const importer = path.join(root, "packages/platform/server/api.ts");
  const resolved = createRequire(importer).resolve("next/server");
  if (!inside(root, realpathSync(resolved))) throw new Error("data release Next runtime resolves outside artifact");
  return { releaseNext, resolved };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const standaloneRoot = process.argv[2];
  if (!standaloneRoot || process.argv.length !== 3) throw new Error("usage: link-data-release-next-runtime.mjs STANDALONE_ROOT");
  linkDataReleaseNextRuntime(standaloneRoot);
}
