#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { assertDeployUnitApp, writeDeployUnitApp } from "./deploy-unit-app-generator";

function requiredValue(argv: string[], flag: string) {
  const index = argv.indexOf(flag);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`${flag} is required`);
  return value;
}

export function main(argv = process.argv.slice(2)) {
  const unitId = requiredValue(argv, "--unit");
  const write = argv.includes("--write");
  const files = write ? writeDeployUnitApp(unitId) : assertDeployUnitApp(unitId);
  process.stdout.write(`${unitId} deploy app ${write ? "generated" : "is current"}: ${files.length} file(s)\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
