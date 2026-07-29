import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { analyzeSourceCode } from "./analyzer";

export const DEFAULT_SOURCE_CODE_ANALYSIS_SNAPSHOT = ".cache/source-code-analysis/snapshot.json";
type SourceCodeAnalysisSnapshot = Awaited<ReturnType<typeof analyzeSourceCode>>;
type BlockingDiagnosticsSummary = Pick<
  SourceCodeAnalysisSnapshot["summary"],
  "unclassifiedFileCount" | "ambiguousFileCount" | "missingInterfaceCount" | "dependencyCycleCount" | "mixedResponsibilityFileCount"
>;

export function hasBlockingSourceCodeAnalysisDiagnostics(snapshot: { summary: BlockingDiagnosticsSummary }) {
  return snapshot.summary.unclassifiedFileCount > 0
    || snapshot.summary.ambiguousFileCount > 0
    || snapshot.summary.missingInterfaceCount > 0
    || snapshot.summary.dependencyCycleCount > 0
    || snapshot.summary.mixedResponsibilityFileCount > 0;
}

async function skipOptionalSnapshot(outputPath: string, error: unknown) {
  try {
    await fs.rm(outputPath, { force: true });
  } catch {
    // The snapshot is diagnostic-only. Cleanup failure must not affect the application lifecycle.
  }
  console.warn(`[source-code-analysis] snapshot 生成失败，已跳过且不影响应用启动/构建: ${error instanceof Error ? error.message : error}`);
  return 0;
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
    console.error(`[source-code-analysis] 依赖循环: ${cycle.join(" -> ")}`);
  }
  for (const item of snapshot.diagnostics.mixedResponsibilityFiles) {
    console.error(`[source-code-analysis] 未解耦混合职责: ${item.path} -> ${item.roles.join(" + ")}`);
  }
}

export async function runSourceCodeAnalysis(args = process.argv.slice(2), repositoryRoot = process.cwd()) {
  const write = args.includes("--write");
  const check = args.includes("--check");
  const json = args.includes("--json");
  const optional = args.includes("--optional");
  const outputArg = args.find((argument) => argument.startsWith("--output="));
  const outputPath = path.resolve(repositoryRoot, outputArg?.slice("--output=".length) || DEFAULT_SOURCE_CODE_ANALYSIS_SNAPSHOT);
  let snapshot: Awaited<ReturnType<typeof analyzeSourceCode>>;
  try {
    snapshot = await analyzeSourceCode(repositoryRoot);
  } catch (error) {
    if (!optional) throw error;
    return skipOptionalSnapshot(outputPath, error);
  }
  const failed = hasBlockingSourceCodeAnalysisDiagnostics(snapshot);

  if (write) {
    try {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    } catch (error) {
      if (!optional) throw error;
      return skipOptionalSnapshot(outputPath, error);
    }
    console.log(`source code analysis snapshot: ${path.relative(repositoryRoot, outputPath)}`);
  }
  if (json) console.log(JSON.stringify(snapshot));
  if (failed) printDiagnostics(snapshot);
  if (check && failed) return 1;
  if (!json) {
    console.log(
      `source code analysis: ${snapshot.summary.fileCount} files, ${snapshot.summary.lines} lines, ${snapshot.summary.coveragePercent}% declared, ${snapshot.summary.dependencyCycleCount} dependency cycles`,
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
