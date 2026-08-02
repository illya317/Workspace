import "server-only";

import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  isSourceCodeAnalysisSnapshot,
  type SourceCodeAnalysisSnapshot,
} from "../source-code-analysis-contract";

interface SnapshotCache {
  path: string;
  modifiedAt: number;
  snapshot: SourceCodeAnalysisSnapshot;
}

let snapshotCache: SnapshotCache | null = null;

function snapshotCandidates() {
  const processDirectory = process.argv[1] ? path.dirname(path.resolve(process.argv[1])) : process.cwd();
  return [...new Set([
    process.env.WORKSPACE_SOURCE_CODE_ANALYSIS_SNAPSHOT,
    path.join(process.cwd(), ".cache/source-code-analysis/snapshot.json"),
    path.join(process.cwd(), ".workspace/source-code-analysis/snapshot.json"),
    path.join(processDirectory, ".workspace/source-code-analysis/snapshot.json"),
  ].filter((candidate): candidate is string => Boolean(candidate)))];
}

export function readSourceCodeAnalysisSnapshot() {
  for (const candidate of snapshotCandidates()) {
    try {
      const stat = statSync(candidate);
      if (snapshotCache?.path === candidate && snapshotCache.modifiedAt === stat.mtimeMs) {
        return snapshotCache.snapshot;
      }
      const parsed = JSON.parse(readFileSync(candidate, "utf8")) as unknown;
      if (!isSourceCodeAnalysisSnapshot(parsed)) continue;
      snapshotCache = { path: candidate, modifiedAt: stat.mtimeMs, snapshot: parsed };
      return parsed;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue;
    }
  }
  return null;
}
