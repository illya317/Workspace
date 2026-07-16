#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SPEC_PATTERN = /^e2e\/[A-Za-z0-9_./-]+\.spec\.ts$/;

export function playwrightArguments(mode, specsJson) {
  if (mode === "full") return ["playwright", "test"];
  if (mode !== "targeted") throw new Error(`E2E_MODE must be full or targeted; received ${mode || "empty"}`);
  let specs;
  try {
    specs = JSON.parse(specsJson);
  } catch (error) {
    throw new Error(`E2E_SPECS_JSON must be valid JSON: ${error instanceof Error ? error.message : error}`);
  }
  if (!Array.isArray(specs) || specs.length === 0 || specs.some((spec) => typeof spec !== "string" || !SPEC_PATTERN.test(spec))) {
    throw new Error("targeted E2E requires a non-empty array of normalized e2e/*.spec.ts paths");
  }
  if (new Set(specs).size !== specs.length) throw new Error("targeted E2E specs must be unique");
  return ["playwright", "test", ...specs];
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function main(env = process.env) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = playwrightArguments(env.E2E_MODE || "", env.E2E_SPECS_JSON || "");
  run(npm, ["run", "test:e2e:seed"]);
  run(npx, args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
