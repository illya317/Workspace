#!/usr/bin/env node

import { existsSync, lstatSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const STANDARD_WORKSPACE_DIRECTORIES = Object.freeze([
  "agent",
  "agent-source",
  "assets/agent/avatar",
  "assets/brand/company",
  "assets/user/avatar",
  "audit",
  "backups",
  "cache",
  "config/docs/company",
  "config/hr",
  "config/pharma-qc",
  "config/pharma-qc/dedicated_methods",
  "config/pharma-qc/full",
  "config/pharma-qc/items",
  "config/pharma-qc/records",
  "config/pharma-qc/source",
  "config/pharma-qc/templates",
  "config/tenant",
  "data/docs-editor/templates/production-qc-snapshots",
  "data/docs-editor/templates/production-qc-snapshots/products",
  "data-release-manifests",
  "data-release-sources",
  "library",
  "onlyoffice",
  "pdf",
  "runtime",
  "template",
  "tools/qc",
]);

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") options.root = argv[++index];
    else if (argument?.startsWith("--root=")) options.root = argument.slice("--root=".length);
    else throw new Error(`unknown argument: ${argument ?? "<missing>"}`);
  }
  return options;
}

function requireSafeRoot(value) {
  if (!value || !path.isAbsolute(value)) throw new Error("--root must be an absolute path");
  const normalized = path.resolve(value);
  if (normalized === path.parse(normalized).root) throw new Error("--root cannot be a filesystem root");
  if (existsSync(normalized)) {
    const stat = lstatSync(normalized);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error("--root must be a regular directory, not a file or symlink");
    }
  }
  return normalized;
}

export function initializeWorkspaceConfig(rootValue) {
  const root = requireSafeRoot(rootValue);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const created = [];
  for (const relativePath of STANDARD_WORKSPACE_DIRECTORIES) {
    const directory = path.join(root, ...relativePath.split("/"));
    if (existsSync(directory)) {
      const stat = lstatSync(directory);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`workspace path must be a regular directory: ${relativePath}`);
      }
      continue;
    }
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    created.push(relativePath);
  }
  return { root, created, directories: [...STANDARD_WORKSPACE_DIRECTORIES] };
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const result = initializeWorkspaceConfig(options.root);
  process.stdout.write(`Workspace private directory initialized: ${result.root}\n`);
  process.stdout.write(`Created ${result.created.length} standard directories; existing files were not changed.\n`);
  process.stdout.write("Next: provide .env and config/tenant/profile.json with every referenced tenant file, then run npm run workspace:check.\n");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
