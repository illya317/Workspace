#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { transpileConfig } from "next/dist/build/next-config-ts/transpile-config.js";

import { assertDeployUnitApp } from "../../../scripts/deploy/deploy-unit-app-generator";

const TARGET_PATTERN = /^(monolith|[a-z][a-z0-9-]*)$/;

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`${key} is missing a value`);
    if (key === "--repository") options.repository = value;
    else if (key === "--target") options.target = value;
    else throw new Error(`unknown argument: ${key}`);
  }
  return options;
}

export async function inspectExactNextConfig({ repository, target }) {
  const repositoryRoot = fs.realpathSync(path.resolve(repository));
  if (!TARGET_PATTERN.test(target)) throw new Error("artifact preflight target is invalid");
  if (target !== "monolith") assertDeployUnitApp(target);

  const appRoot = target === "monolith" ? repositoryRoot : path.join(repositoryRoot, "apps", target);
  const nextConfigPath = path.join(appRoot, "next.config.ts");
  if (!fs.lstatSync(nextConfigPath).isFile()) throw new Error(`Next config must be a real file: ${nextConfigPath}`);

  const loaded = await transpileConfig({ nextConfigPath, dir: appRoot });
  const config = loaded.default ?? loaded;
  if (!config || typeof config !== "object" || config.output !== "standalone") {
    throw new Error("real Next config loader did not return a standalone config");
  }

  const expectedRoot = target === "monolith"
    ? path.dirname(repositoryRoot)
    : fs.lstatSync(path.join(repositoryRoot, "node_modules")).isSymbolicLink()
      ? path.dirname(repositoryRoot)
      : repositoryRoot;
  if (path.resolve(config.outputFileTracingRoot ?? "") !== expectedRoot) {
    throw new Error(`Next outputFileTracingRoot does not match target ${target}`);
  }
  if (path.resolve(config.turbopack?.root ?? "") !== expectedRoot) {
    throw new Error(`Next Turbopack root does not match target ${target}`);
  }
  const configuredUnit = config.env?.NEXT_PUBLIC_DEPLOY_UNIT_ID;
  if (target === "monolith" ? configuredUnit !== undefined : configuredUnit !== target) {
    throw new Error(`Next config deploy-unit identity does not match target ${target}`);
  }

  return {
    appRoot: path.relative(repositoryRoot, appRoot) || ".",
    nextConfig: path.relative(repositoryRoot, nextConfigPath),
    targetIdentity: target,
    output: config.output,
    outputFileTracingRoot: expectedRoot,
    outputFileTracingRootRelation: expectedRoot === repositoryRoot ? "repository" : "repository-parent",
    turbopackRoot: expectedRoot,
    turbopackRootRelation: expectedRoot === repositoryRoot ? "repository" : "repository-parent",
    generatedAppCheck: target === "monolith" ? "not-applicable" : "exact-unit-passed",
  };
}

export async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.repository || !options.target) throw new Error("--repository and --target are required");
  process.stdout.write(`${JSON.stringify(await inspectExactNextConfig({
    repository: options.repository,
    target: options.target,
  }))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
