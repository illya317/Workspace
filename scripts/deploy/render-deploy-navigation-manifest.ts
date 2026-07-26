#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createDeployUnitNavigationManifest } from "./deploy-navigation-manifest";

function requiredValue(argv: string[], flag: string) {
  const index = argv.indexOf(flag);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`${flag} is required`);
  return value;
}

export function main(argv = process.argv.slice(2)) {
  const manifest = createDeployUnitNavigationManifest();
  const output = requiredValue(argv, "--output");
  const resolved = path.resolve(output);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = path.join(path.dirname(resolved), `.${path.basename(resolved)}.tmp-${process.pid}-${randomUUID()}`);
  fs.writeFileSync(temporary, `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, resolved);
  fs.chmodSync(resolved, 0o600);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
