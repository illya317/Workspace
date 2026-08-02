#!/usr/bin/env node

import { lstat, readlink, symlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

class ControlledEnvironmentError extends Error {
  constructor(message) {
    super(message);
    this.name = "ControlledEnvironmentError";
  }
}

function fail(message) {
  throw new ControlledEnvironmentError(message);
}

function absoluteDirectory(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) fail(`${label} must be an absolute path`);
  return path.resolve(value);
}

async function requiredDirectory(value, label) {
  const directory = absoluteDirectory(value, label);
  const info = await lstat(directory).catch((error) => {
    if (error.code === "ENOENT") fail(`${label} does not exist`);
    throw error;
  });
  if (!info.isDirectory() || info.isSymbolicLink()) fail(`${label} must be a real directory`);
  return directory;
}

async function requiredEnvironmentFile(value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) fail("controlled environment must be an absolute path");
  const file = path.resolve(value);
  const info = await lstat(file).catch((error) => {
    if (error.code === "ENOENT") fail("controlled environment does not exist");
    throw error;
  });
  if (!info.isFile() && !info.isSymbolicLink()) fail("controlled environment must resolve to a file");
  return file;
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function ensureExternalLink({ worktreeRoot, source, name, label }) {
  if (isWithin(worktreeRoot, source)) fail(`${label} must live outside the release worktree`);
  const target = path.join(worktreeRoot, name);
  const existing = await lstat(target).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!existing) await symlink(source, target);
  else if (!existing.isSymbolicLink()) fail(`release ${name} must be a symlink to the controlled ${label}`);
  const link = await readlink(target);
  if (path.resolve(path.dirname(target), link) !== source) {
    fail(`release ${name} must be a symlink to the controlled ${label}`);
  }
  return target;
}

export async function ensureControlledEnvironment({ worktree, environment, dependencies }) {
  const worktreeRoot = await requiredDirectory(worktree, "release worktree");
  const environmentFile = await requiredEnvironmentFile(environment);
  const dependenciesRoot = await requiredDirectory(
    dependencies ?? path.join(path.dirname(environmentFile), "node_modules"),
    "controlled dependencies",
  );
  const environmentTarget = await ensureExternalLink({
    worktreeRoot, source: environmentFile, name: ".env", label: "environment",
  });
  const dependenciesTarget = await ensureExternalLink({
    worktreeRoot, source: dependenciesRoot, name: "node_modules", label: "dependencies",
  });
  return {
    worktree: worktreeRoot, environment: environmentFile, dependencies: dependenciesRoot,
    environmentTarget, dependenciesTarget,
  };
}

function argumentsMap(tokens) {
  const values = new Map();
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (!flag?.startsWith("--") || value == null) fail(`invalid argument near ${flag ?? "end"}`);
    const key = flag.slice(2);
    if (!["worktree", "environment", "dependencies"].includes(key) || values.has(key)) fail(`unsupported argument ${flag}`);
    values.set(key, value);
  }
  return values;
}

async function main(argv) {
  const [command, ...tokens] = argv;
  if (command !== "ensure") fail("expected ensure command");
  const values = argumentsMap(tokens);
  await ensureControlledEnvironment({
    worktree: values.get("worktree"),
    environment: values.get("environment"),
    dependencies: values.get("dependencies"),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`[错误] ${error.message}\n`);
    process.exitCode = 1;
  });
}
