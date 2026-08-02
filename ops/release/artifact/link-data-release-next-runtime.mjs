#!/usr/bin/env node

import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync } from "node:fs";
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

export function linkDataReleaseNextRuntime(standaloneRoot, sourceNextRoot) {
  const root = realpathSync(path.resolve(standaloneRoot));
  const sourceNext = realpathSync(path.resolve(sourceNextRoot));
  const sourcePackage = JSON.parse(readFileSync(path.join(sourceNext, "package.json"), "utf8"));
  if (sourcePackage.name !== "next") throw new Error("data release Next source is not the Next package");
  const candidates = findNextRuntimes(root);
  if (candidates.length !== 1 || !inside(root, candidates[0])) {
    throw new Error(`data release artifact requires exactly one internal Next runtime; found ${candidates.length}`);
  }
  const releaseNodeModules = path.join(root, "node_modules");
  const releaseNext = path.join(releaseNodeModules, "next");
  const tracedEntry = path.join(candidates[0], "server.js");
  const sourceEntry = path.join(sourceNext, "server.js");
  if (!pathExists(tracedEntry)) copyFileSync(sourceEntry, tracedEntry);
  else if (!readFileSync(tracedEntry).equals(readFileSync(sourceEntry))) throw new Error("data release Next entry conflicts with build dependency");
  mkdirSync(releaseNodeModules, { recursive: true });
  if (pathExists(releaseNext)) {
    if (realpathSync(releaseNext) !== realpathSync(candidates[0])) throw new Error("data release Next runtime target conflicts with traced runtime");
  } else {
    symlinkSync(path.relative(releaseNodeModules, candidates[0]), releaseNext);
  }
  const importer = path.join(root, "packages/platform/server/api.ts");
  const importerRequire = createRequire(importer);
  const resolved = importerRequire.resolve("next/server");
  if (!inside(root, realpathSync(resolved))) throw new Error("data release Next runtime resolves outside artifact");
  return { releaseNext, resolved };
}

export function verifyFinanceJuneCloseRuntime(standaloneRoot) {
  const root = realpathSync(path.resolve(standaloneRoot));
  const entry = "./scripts/import/import-finance-june-close-cutover.ts";
  const result = spawnSync(process.execPath, [
    "--conditions=react-server",
    "--import",
    "tsx",
    "--input-type=module",
    "--eval",
    `await import(${JSON.stringify(entry)})`,
  ], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const diagnostic = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().slice(-8_000);
    throw new Error(`finance June close importer runtime preflight failed: ${diagnostic}`);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const standaloneRoot = process.argv[2];
  const sourceNextRoot = process.argv[3];
  if (!standaloneRoot || !sourceNextRoot || process.argv.length !== 4) {
    throw new Error("usage: link-data-release-next-runtime.mjs STANDALONE_ROOT SOURCE_NEXT_ROOT");
  }
  linkDataReleaseNextRuntime(standaloneRoot, sourceNextRoot);
  verifyFinanceJuneCloseRuntime(standaloneRoot);
}
