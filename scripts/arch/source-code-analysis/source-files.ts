import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";
import ts from "typescript";

import { ROOT_SOURCE_FILES, SOURCE_CODE_ROOTS } from "./declarations";

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
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "generated") continue;
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

export function isGeneratedSource(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim().toLowerCase() ?? "";
  return firstLine.startsWith("// auto-generated")
    || firstLine.startsWith("/* auto-generated")
    || firstLine.startsWith("// generated file")
    || firstLine.startsWith("/* generated file")
    || firstLine.startsWith("# auto-generated")
    || firstLine.startsWith("# generated file")
    || firstLine.startsWith("-- auto-generated")
    || firstLine.startsWith("-- generated file");
}

function countTypeScriptSourceLines(text: string) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, text);
  const lineStarts = ts.computeLineStarts(text);
  const lines = new Set<number>();
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    const start = scanner.getTokenPos();
    const end = scanner.getTextPos();
    const startLine = ts.computeLineAndCharacterOfPosition(lineStarts, start).line;
    const endLine = ts.computeLineAndCharacterOfPosition(lineStarts, Math.max(start, end - 1)).line;
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
