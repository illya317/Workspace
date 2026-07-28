#!/usr/bin/env node

import { generateKeyPairSync } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const UNIT_PATTERN = /^[a-z][a-z0-9-]*$/;

export function createLocalDeployUnitIdentity({ unitId, outputDirectory } = {}) {
  if (!UNIT_PATTERN.test(unitId ?? "")) throw new Error("local deploy unit id is invalid");
  if (!path.isAbsolute(outputDirectory ?? "")) {
    throw new Error("local deploy unit identity directory must be absolute");
  }
  const stat = lstatSync(outputDirectory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("local deploy unit identity directory must be a real directory");
  }
  chmodSync(outputDirectory, 0o700);

  const replayDirectory = path.join(outputDirectory, "replay");
  mkdirSync(replayDirectory, { mode: 0o700 });
  chmodSync(replayDirectory, 0o700);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyFile = path.join(outputDirectory, "private.pem");
  const trustedPublicKeysFile = path.join(outputDirectory, "trusted-public-keys.json");
  writeFileSync(privateKeyFile, privateKey.export({ type: "pkcs8", format: "pem" }), {
    flag: "wx",
    mode: 0o600,
  });
  writeFileSync(trustedPublicKeysFile, `${JSON.stringify({
    schemaVersion: 1,
    kind: "workspace-internal-trusted-public-keys",
    keys: {
      [unitId]: publicKey.export({ type: "spki", format: "pem" }),
    },
  }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  chmodSync(privateKeyFile, 0o600);
  chmodSync(trustedPublicKeysFile, 0o600);
  return { privateKeyFile, trustedPublicKeysFile, replayDirectory };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error("invalid identity argument");
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  if (!options.unit || !options.output) {
    throw new Error("usage: local-deploy-unit-identity.mjs --unit <id> --output <directory>");
  }
  return options;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const identity = createLocalDeployUnitIdentity({
    unitId: options.unit,
    outputDirectory: options.output,
  });
  process.stdout.write(`${JSON.stringify(identity)}\n`);
  return identity;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
