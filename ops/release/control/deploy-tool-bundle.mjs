#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync,
  readdirSync, realpathSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  DEPLOY_TOOL_PROFILE_CATALOG_VERSION,
  deployToolProfileEntries,
} from "./deploy-tool-profiles.mjs";

export const DEPLOY_TOOL_BUNDLE_SCHEMA_VERSION = 1;
export const DEPLOY_TOOL_BUNDLE_KIND = "workspace-deploy-tool-bundle";
export const DEPLOY_TOOL_BUNDLE_MANIFEST = "deploy-tool-bundle-manifest.json";
export const DEPLOY_TOOL_BUNDLE_DIGEST = "deploy-tool-bundle.sha256";

const DIGEST = /^[0-9a-f]{64}$/;
const MODULE_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);
const COPYABLE_EXTENSIONS = new Set([...MODULE_EXTENSIONS, ".json"]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fail(message) {
  throw new Error(message);
}

function assertRegularNoSymlink(root, file, label) {
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    fail(label + " escapes the ops root");
  }
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) fail(label + " must not use a symlink: " + relative);
  }
  if (!lstatSync(file).isFile()) fail(label + " must be a regular file: " + relative);
}

function skipTrivia(source, start) {
  let index = start;
  while (index < source.length) {
    if (/\s/.test(source[index])) index += 1;
    else if (source.startsWith("//", index)) {
      const end = source.indexOf("\n", index + 2);
      index = end < 0 ? source.length : end + 1;
    } else if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      if (end < 0) fail("unterminated module comment");
      index = end + 2;
    } else break;
  }
  return index;
}

function quoted(source, start) {
  const quote = source[start];
  let value = "";
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === quote) return { value, end: index + 1 };
    if (source[index] === "\\") {
      if (index + 1 >= source.length) fail("unterminated module string");
      value += source[index + 1];
      index += 2;
    } else {
      value += source[index];
      index += 1;
    }
  }
  fail("unterminated module string");
}

function skipTemplate(source, start) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") index += 2;
    else if (source.charCodeAt(index) === 96) return index + 1;
    else index += 1;
  }
  fail("unterminated template literal");
}

function isIdentifierCharacter(character) {
  return character !== undefined && /[A-Za-z0-9_$]/.test(character);
}

function wordAt(source, index, word) {
  return source.startsWith(word, index)
    && !isIdentifierCharacter(source[index - 1])
    && !isIdentifierCharacter(source[index + word.length]);
}

function staticSpecifier(source, start) {
  let index = start;
  let depth = 0;
  while (index < source.length) {
    index = skipTrivia(source, index);
    const character = source[index];
    if (character === "'" || character === '"') index = quoted(source, index).end;
    else if (source.charCodeAt(index) === 96) index = skipTemplate(source, index);
    else if (character === "(" || character === "{" || character === "[") {
      depth += 1;
      index += 1;
    } else if (character === ")" || character === "}" || character === "]") {
      depth = Math.max(0, depth - 1);
      index += 1;
    } else if (depth === 0 && wordAt(source, index, "from")) {
      index = skipTrivia(source, index + 4);
      if (source[index] !== "'" && source[index] !== '"') {
        fail("module from specifier must be a string literal");
      }
      return quoted(source, index);
    } else if (depth === 0 && character === ";") return null;
    else index += 1;
  }
  return null;
}

export function parseModuleSpecifiers(source, label = "module") {
  const specifiers = [];
  let index = 0;
  while (index < source.length) {
    index = skipTrivia(source, index);
    const character = source[index];
    if (character === "'" || character === '"') {
      index = quoted(source, index).end;
      continue;
    }
    if (source.charCodeAt(index) === 96) {
      index = skipTemplate(source, index);
      continue;
    }
    if (wordAt(source, index, "import")) {
      let cursor = skipTrivia(source, index + 6);
      if (source[cursor] === ".") {
        index = cursor + 1;
        continue;
      }
      if (source[cursor] === "(") {
        cursor = skipTrivia(source, cursor + 1);
        if (source[cursor] !== "'" && source[cursor] !== '"') {
          fail(label + " dynamic import must use one string literal");
        }
        const token = quoted(source, cursor);
        cursor = skipTrivia(source, token.end);
        if (source[cursor] !== ")") fail(label + " dynamic import must use one string literal");
        specifiers.push(token.value);
        index = cursor + 1;
        continue;
      }
      if (source[cursor] === "'" || source[cursor] === '"') {
        const token = quoted(source, cursor);
        specifiers.push(token.value);
        index = token.end;
        continue;
      }
      const token = staticSpecifier(source, cursor);
      if (token) {
        specifiers.push(token.value);
        index = token.end;
        continue;
      }
    }
    if (wordAt(source, index, "export")) {
      const cursor = skipTrivia(source, index + 6);
      if (source[cursor] === "*" || source[cursor] === "{") {
        const token = staticSpecifier(source, cursor);
        if (token) {
          specifiers.push(token.value);
          index = token.end;
          continue;
        }
      }
    }
    index += 1;
  }
  return specifiers;
}

function resolveModuleSpecifier(opsRoot, importer, specifier) {
  if (specifier.startsWith("node:")) return null;
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    fail("deploy tool bare package import is not self-contained: " + specifier);
  }
  const resolved = path.resolve(path.dirname(importer), specifier);
  const relative = path.relative(opsRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    fail("deploy tool import escapes ops/: " + specifier);
  }
  if (!COPYABLE_EXTENSIONS.has(path.extname(resolved))) {
    fail("deploy tool import must use an explicit supported extension: " + specifier);
  }
  if (!existsSync(resolved)) fail("deploy tool import is missing: " + specifier);
  assertRegularNoSymlink(opsRoot, resolved, "deploy tool dependency");
  return resolved;
}

function normalizeEntrypoint(opsRoot, relative) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative)
    || relative.split(/[\\/]/).includes("..")) {
    fail("deploy tool entrypoint must stay inside ops/");
  }
  const resolved = path.resolve(opsRoot, relative);
  if (!existsSync(resolved)) fail("deploy tool entrypoint is missing: " + relative);
  assertRegularNoSymlink(opsRoot, resolved, "deploy tool entrypoint");
  return resolved;
}

function collectFromOpsRoot(opsRootInput, entrypoints) {
  const opsRoot = realpathSync(path.resolve(opsRootInput));
  if (!lstatSync(opsRoot).isDirectory()) fail("repository ops root is missing");
  if (!Array.isArray(entrypoints) || entrypoints.length === 0) {
    fail("deploy tool entrypoints are required");
  }
  const entries = [...new Set(entrypoints)].map((entry) => normalizeEntrypoint(opsRoot, entry));
  const pending = [...entries];
  const files = new Set();
  while (pending.length > 0) {
    const file = pending.pop();
    if (files.has(file)) continue;
    assertRegularNoSymlink(opsRoot, file, "deploy tool source");
    files.add(file);
    if (!MODULE_EXTENSIONS.has(path.extname(file))) continue;
    const label = path.relative(opsRoot, file);
    for (const specifier of parseModuleSpecifiers(readFileSync(file, "utf8"), label)) {
      const dependency = resolveModuleSpecifier(opsRoot, file, specifier);
      if (dependency && !files.has(dependency)) pending.push(dependency);
    }
  }
  const relative = (file) => path.relative(opsRoot, file).split(path.sep).join("/");
  return {
    opsRoot,
    entries: entries.map(relative).sort(),
    files: [...files].map(relative).sort(),
  };
}

export function collectDeployToolClosure(repository, entrypoints) {
  const repositoryRoot = realpathSync(path.resolve(repository));
  const relativeEntries = entrypoints.map((entry) => {
    if (typeof entry !== "string" || !entry.startsWith("ops/")) {
      fail("deploy tool entrypoint must be an explicit ops/ path");
    }
    return entry.slice(4);
  });
  return collectFromOpsRoot(path.join(repositoryRoot, "ops"), relativeEntries);
}

function allBundleFiles(root, relative = "") {
  const result = [];
  for (const name of readdirSync(path.join(root, relative)).sort()) {
    const nested = path.join(relative, name);
    if (nested === DEPLOY_TOOL_BUNDLE_MANIFEST || nested === DEPLOY_TOOL_BUNDLE_DIGEST) continue;
    const absolute = path.join(root, nested);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) fail("deploy tool bundle must not contain symlinks: " + nested);
    if (stat.isDirectory()) result.push(...allBundleFiles(root, nested));
    else if (stat.isFile()) result.push(nested.split(path.sep).join("/"));
    else fail("deploy tool bundle contains a non-file: " + nested);
  }
  return result;
}

function runSyntaxCheck(command, args, label) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    fail(label + " syntax check failed: " + (result.stderr || result.stdout || "").trim());
  }
}

function bundleFileMode(file) {
  return path.extname(file) === ".sh" ? 0o700 : 0o600;
}

function resolveBuildProfile(profile, entrypoints) {
  if (profile === undefined) return { profile: null, entrypoints };
  if (entrypoints?.length > 0) fail("deploy tool profile cannot be combined with explicit entries");
  return {
    profile: { name: profile, catalogVersion: DEPLOY_TOOL_PROFILE_CATALOG_VERSION },
    entrypoints: deployToolProfileEntries(profile),
  };
}

export function buildDeployToolBundle({ repository, output, profile, entrypoints }) {
  const target = path.resolve(output);
  if (!existsSync(target)) mkdirSync(target, { recursive: true, mode: 0o700 });
  if (!lstatSync(target).isDirectory() || readdirSync(target).length !== 0) {
    fail("deploy tool bundle output must be an empty directory");
  }
  const selected = resolveBuildProfile(profile, entrypoints);
  const closure = collectDeployToolClosure(repository, selected.entrypoints);
  const files = closure.files.map((relative) => {
    const source = path.join(closure.opsRoot, relative);
    const destination = path.join(target, relative);
    mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    copyFileSync(source, destination);
    const mode = bundleFileMode(source);
    chmodSync(destination, mode);
    return { path: relative, mode, sha256: sha256(readFileSync(source)) };
  });
  const unsigned = {
    schemaVersion: DEPLOY_TOOL_BUNDLE_SCHEMA_VERSION,
    kind: DEPLOY_TOOL_BUNDLE_KIND,
    root: "ops",
    profile: selected.profile,
    entries: closure.entries,
    files,
  };
  const manifest = { ...unsigned, bundleDigest: sha256(canonicalJson(unsigned)) };
  writeFileSync(
    path.join(target, DEPLOY_TOOL_BUNDLE_MANIFEST),
    JSON.stringify(manifest, null, 2) + "\n",
    { mode: 0o600, flag: "wx" },
  );
  writeFileSync(
    path.join(target, DEPLOY_TOOL_BUNDLE_DIGEST),
    manifest.bundleDigest + "\n",
    { mode: 0o600, flag: "wx" },
  );
  verifyDeployToolBundle(target);
  return manifest;
}

export function verifyDeployToolBundle(bundleRoot) {
  const root = realpathSync(path.resolve(bundleRoot));
  const manifest = JSON.parse(readFileSync(path.join(root, DEPLOY_TOOL_BUNDLE_MANIFEST), "utf8"));
  const recordedDigest = readFileSync(path.join(root, DEPLOY_TOOL_BUNDLE_DIGEST), "utf8").trim();
  const { bundleDigest, ...unsigned } = manifest;
  if (manifest.schemaVersion !== DEPLOY_TOOL_BUNDLE_SCHEMA_VERSION
    || manifest.kind !== DEPLOY_TOOL_BUNDLE_KIND || manifest.root !== "ops"
    || !DIGEST.test(bundleDigest ?? "") || recordedDigest !== bundleDigest
    || sha256(canonicalJson(unsigned)) !== bundleDigest) {
    fail("deploy tool bundle manifest or digest is invalid");
  }
  if (!Array.isArray(manifest.entries) || !Array.isArray(manifest.files)) {
    fail("deploy tool bundle manifest lists are invalid");
  }
  if (manifest.profile !== null) {
    const expectedEntries = deployToolProfileEntries(manifest.profile?.name)
      .map((entry) => entry.slice(4))
      .sort();
    if (manifest.profile?.catalogVersion !== DEPLOY_TOOL_PROFILE_CATALOG_VERSION
      || JSON.stringify(manifest.entries) !== JSON.stringify(expectedEntries)) {
      fail("deploy tool bundle named profile does not match catalog");
    }
  }
  const declared = manifest.files.map((file) => file?.path);
  if (new Set(declared).size !== declared.length
    || JSON.stringify([...declared].sort()) !== JSON.stringify(allBundleFiles(root).sort())) {
    fail("deploy tool bundle file inventory does not match manifest");
  }
  for (const file of manifest.files) {
    if (typeof file?.path !== "string" || path.isAbsolute(file.path)
      || file.path.split(/[\\/]/).includes("..") || !Number.isInteger(file.mode)
      || !DIGEST.test(file.sha256 ?? "")) {
      fail("deploy tool bundle file entry is invalid");
    }
    const absolute = path.join(root, file.path);
    assertRegularNoSymlink(root, absolute, "deploy tool bundle file");
    const actualMode = lstatSync(absolute).mode & 0o777;
    if (actualMode !== file.mode) {
      fail("deploy tool bundle file mode changed: " + file.path);
    }
    if (sha256(readFileSync(absolute)) !== file.sha256) {
      fail("deploy tool bundle file digest changed: " + file.path);
    }
    const extension = path.extname(file.path);
    if (MODULE_EXTENSIONS.has(extension)) {
      runSyntaxCheck(process.execPath, ["--check", absolute], file.path);
    }
    if (extension === ".sh") runSyntaxCheck("bash", ["-n", absolute], file.path);
  }
  const closure = collectFromOpsRoot(root, manifest.entries);
  if (JSON.stringify(closure.entries) !== JSON.stringify([...manifest.entries].sort())
    || JSON.stringify(closure.files) !== JSON.stringify([...declared].sort())) {
    fail("deploy tool bundle is not a self-contained dependency closure");
  }
  return manifest;
}

function parseCli(argv) {
  const [command, ...args] = argv;
  const value = (flag) => {
    const index = args.indexOf(flag);
    if (index < 0 || index + 1 >= args.length) fail(flag + " is required");
    return args[index + 1];
  };
  if (command === "build") {
    const entrypoints = args.flatMap((argument, index) => (
      argument === "--entry" && args[index + 1] ? [args[index + 1]] : []
    ));
    return {
      command,
      options: {
        repository: value("--repository"),
        output: value("--output"),
        profile: args.includes("--profile") ? value("--profile") : undefined,
        entrypoints,
      },
    };
  }
  if (command === "verify") return { command, bundle: value("--bundle") };
  fail("usage: deploy-tool-bundle.mjs build --repository PATH --output PATH --entry ops/FILE...");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const parsed = parseCli(process.argv.slice(2));
    if (parsed.command === "build") {
      process.stdout.write(buildDeployToolBundle(parsed.options).bundleDigest + "\n");
    } else {
      process.stdout.write(verifyDeployToolBundle(parsed.bundle).bundleDigest + "\n");
    }
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  }
}
