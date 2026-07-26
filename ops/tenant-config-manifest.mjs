#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const PROFILE_PATH = "config/tenant/profile.json";
const REQUIRED_PROFILE_FILE_KEYS = [
  "companies",
  "agentWorkforce",
  "permissionReview",
  "financeImports",
  "productNameAliases",
  "cnbRelease",
  "hrEthnicities",
  "hrProfessionalTitles",
  "hrSchoolWhitelist",
];
const REQUIRED_PROFILE_DIRECTORY_KEYS = ["qcTemplateSnapshots"];
const RETIRED_TENANT_CONFIG_FILES = ["manifest.json"];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function requireRelativePath(value, label) {
  if (typeof value !== "string" || !value || path.isAbsolute(value) || value.includes("\\")) {
    throw new Error(`${label} must be a non-empty POSIX path relative to WORKSPACE_CONFIG_DIR`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`${label} escapes WORKSPACE_CONFIG_DIR: ${value}`);
  }
  return value;
}

function resolveRegularFile(root, relativePath) {
  const resolvedRoot = realpathSync(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`tenant config path escapes root: ${relativePath}`);
  }
  const stat = lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`tenant config input must be a regular file: ${relativePath}`);
  }
  const canonical = realpathSync(resolved);
  if (!canonical.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`tenant config file escapes root through a link: ${relativePath}`);
  }
  return canonical;
}

function resolveRegularDirectory(root, relativePath) {
  const resolvedRoot = realpathSync(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`tenant config directory escapes root: ${relativePath}`);
  }
  const stat = lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`tenant config input must be a regular directory: ${relativePath}`);
  }
  const canonical = realpathSync(resolved);
  if (!canonical.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`tenant config directory escapes root through a link: ${relativePath}`);
  }
  return canonical;
}

function listRegularDirectoryFiles(root, relativeDirectory) {
  const directory = resolveRegularDirectory(root, relativeDirectory);
  const files = [];
  function visit(current, relative) {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(current, entry.name);
      const child = path.posix.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`tenant config managed directory contains a symlink: ${child}`);
      if (entry.isDirectory()) visit(absolute, child);
      else if (entry.isFile()) files.push(child);
      else throw new Error(`tenant config managed directory contains an unsupported entry: ${child}`);
    }
  }
  visit(directory, relativeDirectory);
  if (files.length === 0) throw new Error(`tenant config managed directory is empty: ${relativeDirectory}`);
  return files;
}

function readJson(root, relativePath) {
  const file = resolveRegularFile(root, relativePath);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`invalid JSON in ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function tenantConfigPaths(root) {
  const profile = readJson(root, PROFILE_PATH);
  if (profile?.version !== 1 || !profile.files || typeof profile.files !== "object") {
    throw new Error("tenant profile must use version 1 and declare files");
  }
  const references = REQUIRED_PROFILE_FILE_KEYS.map((key) => (
    requireRelativePath(profile.files[key], `profile.files.${key}`)
  ));
  if (!profile.directories || typeof profile.directories !== "object") {
    throw new Error("tenant profile must declare managed directories");
  }
  const managedDirectories = REQUIRED_PROFILE_DIRECTORY_KEYS.map((key) => (
    requireRelativePath(profile.directories[key], `profile.directories.${key}`)
  ));
  if (new Set(managedDirectories).size !== managedDirectories.length) {
    throw new Error("tenant profile managed-directory references must be unique");
  }
  const companyDocuments = profile.docs?.companyDocuments;
  if (companyDocuments != null && !Array.isArray(companyDocuments)) {
    throw new Error("profile.docs.companyDocuments must be an array");
  }
  const companyDocumentReferences = (companyDocuments ?? []).map((document, index) => (
    requireRelativePath(document?.file, `profile.docs.companyDocuments[${index}].file`)
  ));
  if (new Set(references).size !== references.length) {
    throw new Error("tenant profile file references must be unique");
  }
  const managedFiles = managedDirectories.flatMap((directory) => listRegularDirectoryFiles(root, directory));
  const files = [PROFILE_PATH, ...references, ...companyDocumentReferences, ...managedFiles];
  for (const relativePath of files) resolveRegularFile(root, relativePath);
  for (const relativePath of files.filter((file) => file.endsWith(".json"))) readJson(root, relativePath);
  const cnbRelease = readFileSync(resolveRegularFile(root, profile.files.cnbRelease), "utf8");
  if (!/^cnb-release:\s*(?:\n|\{)/m.test(cnbRelease)) {
    throw new Error("tenant CNB release config must declare cnb-release");
  }
  return { files: [...new Set(files)].sort(), managedDirectories: [...managedDirectories].sort() };
}

function manifestDigest(files) {
  return sha256(Buffer.from(files.map((file) => `${file.path}\0${file.size}\0${file.sha256}\n`).join("")));
}

export function createTenantConfigManifest(root) {
  const { files: paths, managedDirectories } = tenantConfigPaths(root);
  const files = paths.map((relativePath) => {
    const body = readFileSync(resolveRegularFile(root, relativePath));
    return { path: relativePath, size: body.length, sha256: sha256(body) };
  });
  return {
    schemaVersion: 2,
    kind: "workspace-tenant-config",
    digest: manifestDigest(files),
    managedDirectories,
    files,
  };
}

export function readTenantConfigManifest(file) {
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  if (manifest?.schemaVersion !== 2 || manifest.kind !== "workspace-tenant-config"
    || !DIGEST_PATTERN.test(manifest.digest ?? "") || !Array.isArray(manifest.files)
    || manifest.files.length < 2 || !Array.isArray(manifest.managedDirectories)) {
    throw new Error("tenant config deployment manifest is invalid");
  }
  const paths = new Set();
  for (const item of manifest.files) {
    requireRelativePath(item?.path, "manifest file path");
    if (paths.has(item.path)) throw new Error(`duplicate tenant config manifest path: ${item.path}`);
    paths.add(item.path);
    if (!Number.isSafeInteger(item.size) || item.size < 0 || !DIGEST_PATTERN.test(item.sha256 ?? "")) {
      throw new Error(`invalid tenant config manifest entry: ${item.path}`);
    }
  }
  const managedDirectories = new Set();
  for (const directory of manifest.managedDirectories) {
    requireRelativePath(directory, "manifest managed directory");
    if (managedDirectories.has(directory)) throw new Error(`duplicate tenant config managed directory: ${directory}`);
    managedDirectories.add(directory);
    if (![...paths].some((file) => file.startsWith(`${directory}/`))) {
      throw new Error(`tenant config managed directory has no files: ${directory}`);
    }
  }
  if (manifestDigest(manifest.files) !== manifest.digest) {
    throw new Error("tenant config deployment manifest digest is invalid");
  }
  return manifest;
}

export function verifyTenantConfigManifest(root, manifest) {
  const actual = createTenantConfigManifest(root);
  if (JSON.stringify(actual) !== JSON.stringify(manifest)) {
    throw new Error(`tenant config differs from deployment manifest ${manifest.digest}`);
  }
  return actual;
}

function restoreInstalledFiles(targetRoot, backupRoot, applied) {
  for (const item of [...applied].reverse()) {
    const target = path.resolve(targetRoot, item.path);
    if (existsSync(target)) rmSync(target, { force: true });
    if (item.hadPrevious) {
      const backup = path.resolve(backupRoot, item.path);
      mkdirSync(path.dirname(target), { recursive: true });
      renameSync(backup, target);
    }
  }
}

function restoreInstalledDirectories(targetRoot, backupRoot, applied) {
  for (const item of [...applied].reverse()) {
    const target = path.resolve(targetRoot, item.path);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    if (item.hadPrevious) {
      const backup = path.resolve(backupRoot, item.path);
      mkdirSync(path.dirname(target), { recursive: true });
      renameSync(backup, target);
    }
  }
}

export function installTenantConfig({ stagingRoot, targetRoot, backupRoot, manifest }) {
  verifyTenantConfigManifest(stagingRoot, manifest);
  mkdirSync(backupRoot, { recursive: true });
  const applied = [];
  const retired = [];
  const sourceManifest = path.resolve(stagingRoot, ".deployment/tenant-config-manifest.json");
  const targetManifest = path.resolve(targetRoot, ".deployment/tenant-config-manifest.json");
  const previousManifest = path.resolve(backupRoot, "previous-deployment-manifest.json");
  let hadPreviousManifest = false;
  const appliedDirectories = [];
  try {
    for (const relativePath of RETIRED_TENANT_CONFIG_FILES) {
      const target = path.resolve(targetRoot, relativePath);
      if (!existsSync(target)) continue;
      const stat = lstatSync(target);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error(`retired tenant config target must be a regular file: ${relativePath}`);
      }
      const backup = path.resolve(backupRoot, relativePath);
      mkdirSync(path.dirname(backup), { recursive: true });
      renameSync(target, backup);
      retired.push({ path: relativePath, hadPrevious: true });
    }
    for (const directory of manifest.managedDirectories) {
      const source = resolveRegularDirectory(stagingRoot, directory);
      const target = path.resolve(targetRoot, directory);
      const backup = path.resolve(backupRoot, directory);
      mkdirSync(path.dirname(target), { recursive: true });
      let hadPrevious = false;
      if (existsSync(target)) {
        const stat = lstatSync(target);
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
          throw new Error(`existing tenant config target must be a regular directory: ${directory}`);
        }
        mkdirSync(path.dirname(backup), { recursive: true });
        renameSync(target, backup);
        hadPrevious = true;
      }
      appliedDirectories.push({ path: directory, hadPrevious });
      renameSync(source, target);
    }
    for (const item of manifest.files.filter((file) => !manifest.managedDirectories.some((directory) => file.path.startsWith(`${directory}/`)))) {
      const source = resolveRegularFile(stagingRoot, item.path);
      const target = path.resolve(targetRoot, item.path);
      const backup = path.resolve(backupRoot, item.path);
      mkdirSync(path.dirname(target), { recursive: true });
      let hadPrevious = false;
      if (existsSync(target)) {
        const stat = lstatSync(target);
        if (stat.isSymbolicLink() || !stat.isFile()) {
          throw new Error(`existing tenant config target must be a regular file: ${item.path}`);
        }
        mkdirSync(path.dirname(backup), { recursive: true });
        renameSync(target, backup);
        hadPrevious = true;
      }
      applied.push({ path: item.path, hadPrevious });
      renameSync(source, target);
    }
    verifyTenantConfigManifest(targetRoot, manifest);
    mkdirSync(path.dirname(targetManifest), { recursive: true });
    if (existsSync(targetManifest)) {
      renameSync(targetManifest, previousManifest);
      hadPreviousManifest = true;
    }
    copyFileSync(sourceManifest, targetManifest);
    copyFileSync(sourceManifest, path.resolve(backupRoot, "deployment-manifest.json"));
    readTenantConfigManifest(targetManifest);
  } catch (error) {
    if (existsSync(targetManifest)) rmSync(targetManifest, { force: true });
    if (hadPreviousManifest && existsSync(previousManifest)) renameSync(previousManifest, targetManifest);
    restoreInstalledFiles(targetRoot, backupRoot, applied);
    restoreInstalledDirectories(targetRoot, backupRoot, appliedDirectories);
    restoreInstalledFiles(targetRoot, backupRoot, retired);
    throw error;
  }
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[++index];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`invalid argument: ${key ?? "<missing>"}`);
    }
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

function requireOption(options, key) {
  const value = options[key];
  if (!value) throw new Error(`--${key.replaceAll("_", "-")} is required`);
  return value;
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const options = parseArguments(rest);
  if (command === "validate") {
    const manifest = createTenantConfigManifest(requireOption(options, "root"));
    process.stdout.write(`VALID ${manifest.files.length} ${manifest.digest}\n`);
    return;
  }
  if (command === "create") {
    const output = requireOption(options, "output");
    const manifest = createTenantConfigManifest(requireOption(options, "root"));
    mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${manifest.digest}\n`);
    return;
  }
  if (command === "paths") {
    const manifest = readTenantConfigManifest(requireOption(options, "manifest"));
    process.stdout.write(`${manifest.files.map((file) => file.path).join("\n")}\n`);
    return;
  }
  if (command === "verify") {
    const manifest = readTenantConfigManifest(requireOption(options, "manifest"));
    verifyTenantConfigManifest(requireOption(options, "root"), manifest);
    process.stdout.write(`MATCH ${manifest.digest}\n`);
    return;
  }
  if (command === "install") {
    const manifestFile = requireOption(options, "manifest");
    installTenantConfig({
      stagingRoot: requireOption(options, "staging_root"),
      targetRoot: requireOption(options, "target_root"),
      backupRoot: requireOption(options, "backup_root"),
      manifest: readTenantConfigManifest(manifestFile),
    });
    process.stdout.write(`INSTALLED ${readTenantConfigManifest(manifestFile).digest}\n`);
    return;
  }
  throw new Error(`unknown command: ${command ?? "<missing>"}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
