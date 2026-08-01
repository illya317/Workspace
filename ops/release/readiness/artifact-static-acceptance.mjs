#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { inspectArchive } from "./artifact-inspection.mjs";

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value == null) throw new Error(`invalid argument near ${key ?? "end"}`);
    const name = key.slice(2);
    if (!new Set(["artifact", "manifest", "target"]).has(name) || options[name]) {
      throw new Error(`unsupported or duplicate argument ${key}`);
    }
    options[name] = value;
  }
  for (const name of ["artifact", "manifest", "target"]) {
    if (!options[name]) throw new Error(`--${name} is required`);
  }
  return options;
}

export function assertArtifactStaticAcceptance({ artifact, manifest, target }) {
  const parsedManifest = JSON.parse(fs.readFileSync(manifest, "utf8"));
  return inspectArchive({ artifact, manifest: parsedManifest, target });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = assertArtifactStaticAcceptance(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({ status: "MATCH", ...result })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
