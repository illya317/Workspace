#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const VENDOR_TARBALL = path.join(ROOT, "vendor/sheetjs/xlsx-0.20.3.tgz");
const PROVENANCE_FILE = path.join(ROOT, "vendor/sheetjs/PROVENANCE.md");
const PACKAGE_JSON = path.join(ROOT, "package.json");

// Pinned upstream artifact facts. Any artifact upgrade must update this constant,
// vendor/sheetjs/PROVENANCE.md and docs/engineering/reference/spreadsheet-dependencies.md
// in the same commit. Do not weaken this check to accept a range or a registry version.
export const SHEETJS_VENDOR_VERSION = "0.20.3";
export const SHEETJS_VENDOR_SHA256 = "8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8";
export const SHEETJS_PACKAGE_SPEC = "file:vendor/sheetjs/xlsx-0.20.3.tgz";

function sha256OfFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readTarballPackageVersion(tarballPath) {
  const archive = zlib.gunzipSync(fs.readFileSync(tarballPath));
  let offset = 0;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    if (!name) break;
    const sizeText = header.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim();
    const size = Number.parseInt(sizeText || "0", 8);
    const bodyStart = offset + 512;
    if (name === "package/package.json") {
      const parsed = JSON.parse(archive.subarray(bodyStart, bodyStart + size).toString("utf8"));
      return typeof parsed.version === "string" ? parsed.version : null;
    }
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
  return null;
}

export function inspectSheetjsVendor() {
  const errors = [];

  if (!fs.existsSync(VENDOR_TARBALL)) {
    errors.push("vendor/sheetjs/xlsx-0.20.3.tgz is missing; restore the pinned SheetJS CE artifact");
    return { errors, sha256: null, tarballVersion: null };
  }

  const sha256 = sha256OfFile(VENDOR_TARBALL);
  if (sha256 !== SHEETJS_VENDOR_SHA256) {
    errors.push(
      `vendor/sheetjs/xlsx-0.20.3.tgz SHA-256 mismatch: expected ${SHEETJS_VENDOR_SHA256}, got ${sha256}; do not modify the vendored artifact`,
    );
  }

  const tarballVersion = readTarballPackageVersion(VENDOR_TARBALL);
  if (tarballVersion !== SHEETJS_VENDOR_VERSION) {
    errors.push(
      `vendor/sheetjs/xlsx-0.20.3.tgz package version mismatch: expected ${SHEETJS_VENDOR_VERSION}, got ${tarballVersion ?? "unreadable"}`,
    );
  }

  if (!fs.existsSync(PROVENANCE_FILE)) {
    errors.push("vendor/sheetjs/PROVENANCE.md is missing; the vendored artifact requires provenance records");
  } else if (!fs.readFileSync(PROVENANCE_FILE, "utf8").includes(SHEETJS_VENDOR_SHA256)) {
    errors.push("vendor/sheetjs/PROVENANCE.md does not record the pinned SHA-256");
  }

  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8"));
  const spec = packageJson.dependencies?.xlsx ?? packageJson.devDependencies?.xlsx;
  if (spec !== SHEETJS_PACKAGE_SPEC) {
    errors.push(`package.json xlsx dependency must be exactly "${SHEETJS_PACKAGE_SPEC}", got ${JSON.stringify(spec)}`);
  }

  return { errors, sha256, tarballVersion };
}

export function main(argv = process.argv.slice(2)) {
  const result = inspectSheetjsVendor();
  if (argv.includes("--report")) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.errors.length > 0) {
    if (!argv.includes("--report")) result.errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }
  console.log(`SheetJS vendor checksum passed (xlsx ${result.tarballVersion}, sha256 ${result.sha256}).`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
