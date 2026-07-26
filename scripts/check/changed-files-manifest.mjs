import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { changedFileSets } = require("./changed-files.js");

const SNAPSHOT_PATTERN = /^[0-9a-f]{64}$/;
const CHANGED_TASK_IDS = new Set(["lint-changed", "domain-changed", "db-migration-changed"]);

function manifestKey(snapshotKey, env) {
  return crypto.createHash("sha256").update(JSON.stringify({
    snapshotKey,
    base: env.WORKSPACE_DIFF_BASE ?? "",
    head: env.WORKSPACE_DIFF_HEAD ?? "",
    version: 1,
  })).digest("hex");
}

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`);
  fs.renameSync(temporary, file);
}

export function prepareChangedFilesManifest(taskIds, {
  cwd = process.cwd(),
  env = process.env,
  collect = changedFileSets,
  write = atomicWriteJson,
} = {}) {
  if (!taskIds.some((taskId) => CHANGED_TASK_IDS.has(taskId))) return null;
  const snapshotKey = env.CHECK_WORKSPACE_SNAPSHOT_KEY?.trim();
  if (!SNAPSHOT_PATTERN.test(snapshotKey ?? "")) return null;

  const result = collect({
    cwd,
    diffFilter: "ACMR",
    env: { ...env, WORKSPACE_CHANGED_FILES_MANIFEST: "" },
  });
  const file = path.join(cwd, ".cache", "check-context", `changed-${manifestKey(snapshotKey, env)}.json`);
  write(file, {
    schemaVersion: 1,
    repositoryRoot: path.resolve(cwd),
    snapshotKey,
    diffFilter: "ACMR",
    ...result,
  });
  return {
    file,
    hasStagedChanges: result.hasStagedChanges,
    source: result.source,
  };
}
