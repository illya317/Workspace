import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  isSourceCodeAnalysisSnapshot,
  type SourceCodeAnalysisSnapshot,
} from "../../../packages/platform/source-code-analysis-contract";
import { analyzeSourceCode } from "./analyzer";

export const DEFAULT_SOURCE_CODE_ANALYSIS_SNAPSHOT = ".cache/source-code-analysis/snapshot.json";
type BlockingDiagnosticsSummary = Pick<
  SourceCodeAnalysisSnapshot["summary"],
  "unclassifiedFileCount" | "ambiguousFileCount" | "missingInterfaceCount" | "dependencyCycleCount" | "dependencyFileCycleCount" | "invalidDependencyDirectionCount" | "mixedResponsibilityFileCount" | "newUnclassifiedCapabilityFileCount" | "ambiguousCapabilityFileCount"
>;

export function hasBlockingSourceCodeAnalysisDiagnostics(snapshot: { summary: BlockingDiagnosticsSummary }) {
  return snapshot.summary.unclassifiedFileCount > 0
    || snapshot.summary.ambiguousFileCount > 0
    || snapshot.summary.missingInterfaceCount > 0
    || snapshot.summary.dependencyCycleCount > 0
    || (snapshot.summary.dependencyFileCycleCount ?? 0) > 0
    || snapshot.summary.invalidDependencyDirectionCount > 0
    || snapshot.summary.mixedResponsibilityFileCount > 0
    || snapshot.summary.newUnclassifiedCapabilityFileCount > 0
    || snapshot.summary.ambiguousCapabilityFileCount > 0;
}

function printDiagnostics(snapshot: Awaited<ReturnType<typeof analyzeSourceCode>>) {
  for (const file of snapshot.diagnostics.unclassifiedFiles) console.error(`[source-code-analysis] 未声明归属: ${file}`);
  for (const file of snapshot.diagnostics.ambiguousFiles) {
    console.error(`[source-code-analysis] 多重归属: ${file.path} -> ${file.moduleKeys.join(", ")}`);
  }
  for (const item of snapshot.diagnostics.missingInterfaces) {
    console.error(`[source-code-analysis] 模块 interface 不存在: ${item.moduleKey} -> ${item.path}`);
  }
  for (const cycle of snapshot.dependencyCycles) {
    console.error(`[source-code-analysis] 模块依赖循环: ${cycle.join(" -> ")}`);
  }
  for (const cycle of snapshot.dependencyFileCycles) {
    console.error(`[source-code-analysis] ${cycle.classification === "runtime" ? "运行时" : "类型"}文件依赖循环: ${cycle.paths.join(" -> ")}`);
  }
  for (const item of snapshot.invalidDependencyDirections) {
    console.error(
      `[source-code-analysis] 非法依赖方向(${item.reason}): ${item.sourcePath} [${item.sourceModuleKey}/${item.sourceRole}] -> ${item.targetPath} [${item.targetModuleKey}/${item.targetRole}] (${item.kind})`,
    );
  }
  for (const item of snapshot.diagnostics.mixedResponsibilityFiles) {
    console.error(`[source-code-analysis] 未解耦混合职责: ${item.path} -> ${item.roles.join(" + ")}`);
  }
  for (const item of snapshot.diagnostics.newUnclassifiedCapabilityFiles) {
    console.error(`[source-code-analysis] 新增未声明 L2 能力归属: ${item.path} [${item.moduleKey}]`);
  }
  for (const item of snapshot.diagnostics.ambiguousCapabilityFiles) {
    console.error(
      `[source-code-analysis] L2 能力多重归属: ${item.path} [${item.moduleKey}] -> ${item.capabilityKeys.join(", ")}`,
    );
  }
}

export async function writeSourceCodeAnalysisSnapshot(outputPath: string, snapshot: SourceCodeAnalysisSnapshot) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    const parsed = JSON.parse(await fs.readFile(temporaryPath, "utf8")) as unknown;
    if (!isSourceCodeAnalysisSnapshot(parsed)) throw new Error("生成的源码分析 snapshot 不符合当前 contract");
    await fs.rename(temporaryPath, outputPath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

async function readValidSnapshot(outputPath: string) {
  try {
    const snapshot = JSON.parse(await fs.readFile(outputPath, "utf8")) as unknown;
    return isSourceCodeAnalysisSnapshot(snapshot) ? snapshot : null;
  } catch {
    return null;
  }
}

export async function runSourceCodeAnalysis(args = process.argv.slice(2), repositoryRoot = process.cwd()) {
  const ensure = args.includes("--ensure");
  const write = args.includes("--write") || ensure;
  const check = args.includes("--check");
  const json = args.includes("--json");
  const outputArg = args.find((argument) => argument.startsWith("--output="));
  const outputPath = path.resolve(repositoryRoot, outputArg?.slice("--output=".length) || DEFAULT_SOURCE_CODE_ANALYSIS_SNAPSHOT);
  let snapshot: Awaited<ReturnType<typeof analyzeSourceCode>> | null = null;
  if (ensure) {
    const existingSnapshot = await readValidSnapshot(outputPath);
    if (existingSnapshot) {
      snapshot = await analyzeSourceCode(repositoryRoot);
      if (existingSnapshot.sourceDigest === snapshot.sourceDigest) {
        console.log(`source code analysis snapshot ready: ${path.relative(repositoryRoot, outputPath)}`);
        return 0;
      }
    }
  }
  snapshot ??= await analyzeSourceCode(repositoryRoot);
  const failed = hasBlockingSourceCodeAnalysisDiagnostics(snapshot);

  if (json) console.log(JSON.stringify(snapshot));
  if (failed) printDiagnostics(snapshot);
  if (check && failed) return 1;
  if (write) {
    await writeSourceCodeAnalysisSnapshot(outputPath, snapshot);
    console.log(`source code analysis snapshot: ${path.relative(repositoryRoot, outputPath)}`);
  }
  if (!json) {
    console.log(
      `source code analysis: ${snapshot.summary.fileCount} files, ${snapshot.summary.lines} lines, ${snapshot.summary.coveragePercent}% L1 declared, ${snapshot.summary.capabilityCoveragePercent}% L2 declared, ${snapshot.summary.dependencyCycleCount} module cycles, ${snapshot.summary.dependencyFileCycleCount} file cycles, ${snapshot.summary.invalidDependencyDirectionCount} invalid directions`,
    );
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSourceCodeAnalysis().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
