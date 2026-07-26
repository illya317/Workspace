#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse, stringify } from "yaml";

import { validateCnbReleaseConfig } from "./validate-cnb-release-config.mjs";

function option(argv, name, fallback = undefined) {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} is missing a value`);
  return value;
}

export function renderCnbReleaseConfig(source, { deployUnitId = "", deployUnitMode = "shadow" } = {}) {
  validateCnbReleaseConfig(source);
  const document = parse(source);
  const pipeline = document["cnb-release"].api_trigger_manual[0];
  pipeline.env.DEPLOY_UNIT_ID = deployUnitId;
  pipeline.env.DEPLOY_UNIT_MODE = deployUnitMode;
  const rendered = stringify(document, { lineWidth: 0 });
  validateCnbReleaseConfig(rendered, { deployUnitId, deployUnitMode });
  return rendered;
}

function main(argv = process.argv.slice(2)) {
  const input = option(argv, "--input");
  const output = option(argv, "--output");
  const deployUnitId = option(argv, "--deploy-unit", "");
  const deployUnitMode = option(argv, "--deploy-unit-mode", "shadow");
  if (!input || !output) throw new Error("usage: render-cnb-release-config.mjs --input FILE --output FILE [--deploy-unit ID]");
  const rendered = renderCnbReleaseConfig(readFileSync(input, "utf8"), { deployUnitId, deployUnitMode });
  const temporary = path.join(path.dirname(output), `.${path.basename(output)}.tmp-${process.pid}-${randomUUID()}`);
  writeFileSync(temporary, rendered, { mode: 0o600 });
  renameSync(temporary, output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
