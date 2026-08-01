import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function archivePath(value) {
  const withoutPrefix = value.replace(/^\.\//, "").replace(/\/$/, "");
  const normalized = path.posix.normalize(withoutPrefix);
  if (!withoutPrefix || normalized !== withoutPrefix || normalized === ".." || normalized.startsWith("../")
    || path.posix.isAbsolute(withoutPrefix)) {
    throw new Error(`artifact contains unsafe archive path: ${value}`);
  }
  return normalized;
}

function listArchive(file) {
  const listing = execFileSync("tar", ["-tzf", file], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const entries = new Map();
  for (const raw of listing.split("\n").filter(Boolean)) {
    if (raw === "." || raw === "./") continue;
    const normalized = archivePath(raw);
    if (entries.has(normalized)) throw new Error(`artifact contains duplicate archive path: ${normalized}`);
    entries.set(normalized, raw);
  }
  return entries;
}

function validateArchiveLinks(file, entries) {
  const listing = execFileSync(
    "tar",
    ["--numeric-owner", "--full-time", "-tvzf", file],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  for (const line of listing.split("\n").filter(Boolean)) {
    if (!line.startsWith("l")) continue;
    const match = line.match(/^l\S+\s+\S+\s+\d+\s+\S+\s+\S+\s+(?:(?:[+-]\d{4})\s+)?(.+?) -> (.+)$/);
    if (!match) throw new Error(`unable to parse artifact symlink metadata: ${line}`);
    const link = archivePath(match[1]);
    const target = match[2];
    if (!target || target.includes("\\") || target.includes("\0") || path.posix.isAbsolute(target)) {
      throw new Error(`artifact contains unsafe symlink: ${link} -> ${target}`);
    }
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(link), target));
    if (resolved === ".." || resolved.startsWith("../") || path.posix.isAbsolute(resolved)) {
      throw new Error(`artifact symlink escapes archive root: ${link} -> ${target}`);
    }
    const exists = entries.has(resolved)
      || [...entries.keys()].some((entry) => entry.startsWith(`${resolved}/`));
    if (!exists) throw new Error(`artifact contains broken symlink: ${link} -> ${target}`);
  }
}

function archiveFile(artifact, entries, relative) {
  const raw = entries.get(relative);
  if (!raw) throw new Error(`artifact is missing required runtime file: ${relative}`);
  return execFileSync("tar", ["-xOzf", artifact, raw], { maxBuffer: 64 * 1024 * 1024 });
}

export function inspectArchive({ artifact, manifest, target }) {
  const entries = listArchive(artifact);
  validateArchiveLinks(artifact, entries);
  const serverEntry = archivePath(archiveFile(artifact, entries, ".server-entry").toString("utf8").trim());
  if (!serverEntry.endsWith("server.js")) throw new Error("artifact server entry must end in server.js");
  if (target !== "monolith" && manifest.build?.serverEntry !== serverEntry) {
    throw new Error("deploy-unit server entry differs from manifest");
  }
  const appRoot = path.posix.dirname(serverEntry);
  const appFile = (relative) => appRoot === "." ? relative : `${appRoot}/${relative}`;
  const buildId = archiveFile(artifact, entries, appFile(".next/BUILD_ID")).toString("utf8").trim();
  const routes = JSON.parse(archiveFile(artifact, entries, appFile(".next/routes-manifest.json")).toString("utf8"));
  const expectedBuildId = target === "monolith" ? manifest.source.contentDigest : manifest.build.buildId;
  if (buildId !== expectedBuildId) throw new Error("artifact BUILD_ID differs from manifest");
  if (routes.basePath !== "/workspace") throw new Error(`artifact basePath must be /workspace, received ${routes.basePath ?? "<missing>"}`);
  const required = target === "monolith"
    ? [
        "prisma/schema.prisma",
        "prisma/migrations/migration_lock.toml",
        "node_modules/prisma/build/index.js",
        "seed-resources-runtime.mjs",
        "scripts/check/check-prisma-deploy-status.js",
        "ops/apply-data-release.mjs",
      ]
    : [".deploy-unit-contract.json", ".control-plane-requirements.json"];
  for (const file of required) archiveFile(artifact, entries, file);
  const directory = fs.mkdtempSync(path.join(tmpdir(), "workspace-ready-entry-"));
  try {
    const entryFile = path.join(directory, "server.js");
    fs.writeFileSync(entryFile, archiveFile(artifact, entries, serverEntry), { mode: 0o600 });
    const syntax = spawnSync(process.execPath, ["--check", entryFile], { encoding: "utf8" });
    if (syntax.status !== 0) throw new Error(`artifact server entry syntax failed: ${syntax.stderr.trim()}`);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  return { serverEntry, buildId, basePath: "/workspace", entryCount: entries.size };
}
