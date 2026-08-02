#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DIRECTORY_MODE = 0o755;
const READ_ONLY_MODE = 0o444;
const EXECUTABLE_MODE = 0o555;

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function realDirectory(root) {
  const resolved = path.resolve(root ?? "");
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`runtime tree root must be a real directory: ${resolved}`);
  }
  return fs.realpathSync(resolved);
}

function validateSymlink(root, file) {
  const target = fs.readlinkSync(file);
  if (!target || target.includes("\\") || target.includes("\0") || path.isAbsolute(target)) {
    throw new Error(`runtime tree contains unsafe symlink: ${file} -> ${target}`);
  }
  const lexicalTarget = path.resolve(path.dirname(file), target);
  if (!inside(root, lexicalTarget)) throw new Error(`runtime tree symlink escapes root: ${file} -> ${target}`);
  let realTarget;
  try {
    realTarget = fs.realpathSync(file);
  } catch {
    throw new Error(`runtime tree contains broken symlink: ${file} -> ${target}`);
  }
  if (!inside(root, realTarget)) throw new Error(`runtime tree symlink escapes root: ${file} -> ${target}`);
}

export function normalizeRuntimeTree(root) {
  const runtimeRoot = realDirectory(root);
  const seenFiles = new Map();
  const summary = { directories: 0, files: 0, executableFiles: 0, symlinks: 0 };
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      const stat = fs.lstatSync(entryPath);
      if (stat.isSymbolicLink()) {
        validateSymlink(runtimeRoot, entryPath);
        summary.symlinks += 1;
      } else if (stat.isDirectory()) {
        visit(entryPath);
        fs.chmodSync(entryPath, DIRECTORY_MODE);
        summary.directories += 1;
      } else if (stat.isFile()) {
        const inode = `${stat.dev}:${stat.ino}`;
        if (seenFiles.has(inode)) {
          throw new Error(`runtime tree contains hardlink: ${entryPath} -> ${seenFiles.get(inode)}`);
        }
        seenFiles.set(inode, entryPath);
        const executable = Boolean(stat.mode & 0o111);
        fs.chmodSync(entryPath, executable ? EXECUTABLE_MODE : READ_ONLY_MODE);
        summary.files += 1;
        if (executable) summary.executableFiles += 1;
      } else {
        throw new Error(`runtime tree contains special entry: ${entryPath}`);
      }
    }
  }
  visit(runtimeRoot);
  fs.chmodSync(runtimeRoot, DIRECTORY_MODE);
  summary.directories += 1;
  return summary;
}

function parseTarLine(line) {
  const match = line.match(/^(\S+)\s+\S+\s+\S+\s+\S+\s+\S+\s+(?:(?:[+-]\d{4})\s+)?(.+)$/);
  if (!match || match[1].length !== 10) throw new Error(`unable to parse artifact mode metadata: ${line}`);
  const mode = match[1];
  if (/[^dlrwx-]/.test(mode)) throw new Error(`artifact contains special permission bits: ${line}`);
  const rawName = match[2];
  const name = mode[0] === "l" ? rawName.split(" -> ", 1)[0] : rawName;
  return { mode, name };
}

export function assertArchiveRuntimePermissions(listing) {
  let count = 0;
  for (const line of listing.split("\n").filter(Boolean)) {
    const { mode, name } = parseTarLine(line);
    const type = mode[0];
    if (type !== "d" && type !== "-" && type !== "l") {
      throw new Error(`artifact contains special runtime entry: ${name}`);
    }
    if (type === "l") {
      count += 1;
      continue;
    }
    if (mode[5] === "w" || mode[8] === "w") {
      throw new Error(`artifact runtime entry is group/world writable: ${name} (${mode})`);
    }
    if (type === "d" && mode !== "drwxr-xr-x") {
      throw new Error(`artifact runtime directory is not isolated-user traversable with exact 0755 mode: ${name} (${mode})`);
    }
    if (type === "-" && mode !== "-r--r--r--" && mode !== "-r-xr-xr-x") {
      if (mode[7] !== "r") {
        throw new Error(`artifact runtime file is not isolated-user readable: ${name} (${mode})`);
      }
      if ([mode[3], mode[6], mode[9]].includes("x") && mode[9] !== "x") {
        throw new Error(`artifact executable is not isolated-user executable: ${name} (${mode})`);
      }
      throw new Error(`artifact runtime file mode is not exact 0444 or 0555: ${name} (${mode})`);
    }
    count += 1;
  }
  if (count === 0) throw new Error("artifact runtime permission listing is empty");
  return { entryCount: count };
}

function requiredOption(argv, flag) {
  const index = argv.indexOf(flag);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`${flag} is required`);
  return value;
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (command !== "normalize") throw new Error("command must be normalize");
  const root = path.resolve(requiredOption(rest, "--root"));
  const summary = normalizeRuntimeTree(root);
  process.stdout.write(`runtime tree permissions normalized: ${JSON.stringify(summary)}\n`);
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
