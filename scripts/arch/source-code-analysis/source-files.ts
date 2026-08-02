import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";
import ts from "typescript";

import { ROOT_SOURCE_FILES, SOURCE_CODE_ROOTS } from "./declarations";

export interface GeneratedSourceRegistration {
  path: string;
  marker: string;
  verificationCommand: string;
}

export interface GeneratedSourceRootRegistration {
  prefix: string;
  verificationCommand: string;
}

export const GENERATED_SOURCE_REGISTRATIONS: readonly GeneratedSourceRegistration[] = [];

export const GENERATED_SOURCE_ROOT_REGISTRATIONS: readonly GeneratedSourceRootRegistration[] = [{
  prefix: "generated/prisma/",
  verificationCommand: "npm run db:generate",
}];

const TYPESCRIPT_SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const SOURCE_EXTENSIONS = new Set([
  ...TYPESCRIPT_SOURCE_EXTENSIONS,
  ".css",
  ".scss",
  ".prisma",
  ".sql",
  ".sh",
  ".py",
  ".yml",
  ".yaml",
]);

async function walkSourceFiles(repositoryRoot: string, absoluteDirectory: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(absoluteDirectory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }

  const result: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(absoluteDirectory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      result.push(...await walkSourceFiles(repositoryRoot, absolutePath));
      continue;
    }
    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (entry.name.endsWith(".d.ts")) continue;
    result.push(path.relative(repositoryRoot, absolutePath).split(path.sep).join("/"));
  }
  return result;
}

export async function collectSourceFiles(repositoryRoot: string) {
  const nested = await Promise.all(
    SOURCE_CODE_ROOTS.map((directory) => walkSourceFiles(repositoryRoot, path.join(repositoryRoot, directory))),
  );
  const rootFiles: string[] = [];
  for (const candidate of ROOT_SOURCE_FILES) {
    try {
      const stat = await fs.stat(path.join(repositoryRoot, candidate));
      if (stat.isFile()) rootFiles.push(candidate);
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
    }
  }
  return [...nested.flat(), ...rootFiles].sort();
}

function missingGeneratedSourceTarget(pathname: string, verificationCommand: string) {
  return new Error(
    `[source-code-analysis] registered generated source target is missing: ${pathname}; run ${verificationCommand}`,
  );
}

async function collectGeneratedRootTargets(
  repositoryRoot: string,
  registration: GeneratedSourceRootRegistration,
  absoluteDirectory: string,
  targets: Set<string>,
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(absoluteDirectory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw missingGeneratedSourceTarget(registration.prefix, registration.verificationCommand);
    }
    throw error;
  }
  for (const entry of entries) {
    const absolutePath = path.join(absoluteDirectory, entry.name);
    if (entry.isDirectory()) {
      await collectGeneratedRootTargets(repositoryRoot, registration, absolutePath, targets);
    } else if (entry.isFile() && TYPESCRIPT_SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      targets.add(path.relative(repositoryRoot, absolutePath).split(path.sep).join("/"));
    }
  }
}

export async function collectRegisteredGeneratedSourceTargets(
  repositoryRoot: string,
  sourceRegistrations: readonly GeneratedSourceRegistration[] = GENERATED_SOURCE_REGISTRATIONS,
  rootRegistrations: readonly GeneratedSourceRootRegistration[] = GENERATED_SOURCE_ROOT_REGISTRATIONS,
) {
  const targets = new Set<string>();
  for (const registration of sourceRegistrations) {
    const absolutePath = path.join(repositoryRoot, registration.path);
    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) throw missingGeneratedSourceTarget(registration.path, registration.verificationCommand);
      const text = await fs.readFile(absolutePath, "utf8");
      isGeneratedSource(registration.path, text, [registration]);
      targets.add(registration.path);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        throw missingGeneratedSourceTarget(registration.path, registration.verificationCommand);
      }
      throw error;
    }
  }
  for (const registration of rootRegistrations) {
    await collectGeneratedRootTargets(
      repositoryRoot,
      registration,
      path.join(repositoryRoot, registration.prefix),
      targets,
    );
  }
  return targets;
}

function hasGeneratedSourceMarker(firstLine: string) {
  const normalized = firstLine.toLowerCase();
  return normalized.startsWith("// auto-generated")
    || normalized.startsWith("/* auto-generated")
    || normalized.startsWith("// generated file")
    || normalized.startsWith("/* generated file")
    || normalized.startsWith("# auto-generated")
    || normalized.startsWith("# generated file")
    || normalized.startsWith("-- auto-generated")
    || normalized.startsWith("-- generated file");
}

export function generatedSourceVerificationCommandForPath(
  relativePath: string,
  sourceRegistrations: readonly GeneratedSourceRegistration[] = GENERATED_SOURCE_REGISTRATIONS,
  rootRegistrations: readonly GeneratedSourceRootRegistration[] = GENERATED_SOURCE_ROOT_REGISTRATIONS,
) {
  const normalized = relativePath.replaceAll("\\", "/");
  const registeredFile = sourceRegistrations.find((registration) => {
    if (registration.path === normalized) return true;
    const extension = path.posix.extname(registration.path);
    if (!extension) return false;
    return registration.path.slice(0, -extension.length) === normalized
      || registration.path === `${normalized}/index${extension}`;
  });
  if (registeredFile) return registeredFile.verificationCommand;
  return rootRegistrations.find((registration) =>
    normalized === registration.prefix.slice(0, -1) || normalized.startsWith(registration.prefix))
    ?.verificationCommand ?? null;
}

export function isRegisteredGeneratedSourcePath(
  relativePath: string,
  sourceRegistrations: readonly GeneratedSourceRegistration[] = GENERATED_SOURCE_REGISTRATIONS,
  rootRegistrations: readonly GeneratedSourceRootRegistration[] = GENERATED_SOURCE_ROOT_REGISTRATIONS,
) {
  return generatedSourceVerificationCommandForPath(relativePath, sourceRegistrations, rootRegistrations) !== null;
}

export function isGeneratedSource(
  relativePath: string,
  text: string,
  registrations: readonly GeneratedSourceRegistration[] = GENERATED_SOURCE_REGISTRATIONS,
) {
  const normalizedPath = relativePath.replaceAll("\\", "/");
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const registration = registrations.find((candidate) => candidate.path === normalizedPath);
  if (registration) {
    if (firstLine !== registration.marker) {
      throw new Error(
        `[source-code-analysis] registered generated source marker mismatch: ${normalizedPath}; verify with ${registration.verificationCommand}`,
      );
    }
    return true;
  }
  if (hasGeneratedSourceMarker(firstLine)) {
    throw new Error(`[source-code-analysis] generated source is not registered: ${normalizedPath}`);
  }
  return false;
}

function countTypeScriptSourceLines(text: string) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, text);
  const sourceFile = ts.createSourceFile("source.tsx", text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const lines = new Set<number>();
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    const start = scanner.getTokenPos();
    const end = scanner.getTextPos();
    const startLine = sourceFile.getLineAndCharacterOfPosition(start).line;
    const endLine = sourceFile.getLineAndCharacterOfPosition(Math.max(start, end - 1)).line;
    for (let line = startLine; line <= endLine; line += 1) lines.add(line);
  }
  return lines.size;
}

function countGenericSourceLines(text: string, extension: string) {
  const lineCommentPrefixes = extension === ".sql"
    ? ["--"]
    : extension === ".prisma"
      ? ["//"]
      : extension === ".css" || extension === ".scss"
        ? []
        : ["#"];
  let inBlockComment = false;
  let count = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    let remaining = rawLine.trim();
    while (remaining) {
      if (inBlockComment) {
        const blockEnd = remaining.indexOf("*/");
        if (blockEnd === -1) {
          remaining = "";
          continue;
        }
        inBlockComment = false;
        remaining = remaining.slice(blockEnd + 2).trim();
        continue;
      }
      if (remaining.startsWith("/*")) {
        inBlockComment = true;
        remaining = remaining.slice(2);
        continue;
      }
      if (lineCommentPrefixes.some((prefix) => remaining.startsWith(prefix) && !remaining.startsWith("#!"))) {
        remaining = "";
        continue;
      }
      count += 1;
      break;
    }
  }
  return count;
}

export function countSourceLines(text: string, relativePath: string) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  return TYPESCRIPT_SOURCE_EXTENSIONS.has(extension)
    ? countTypeScriptSourceLines(text)
    : countGenericSourceLines(text, extension);
}
