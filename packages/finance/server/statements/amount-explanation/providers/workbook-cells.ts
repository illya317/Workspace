import type { EvidenceRef } from "@workspace/finance/types/statement-explanation";

import {
  decimalLikeToMinorUnits,
  DecimalNormalizationError,
  formatMinorUnits,
  LEDGER_MONEY_SCALE,
} from "../decimal";
import { buildEvidenceId, fingerprintSource } from "../evidence";
import type { WorkbookAnalysisSnapshot } from "../../comparison/workbook-dto";
import { diagnostics, type AmountEvidenceProvider, type EvidenceCandidate, type ProviderOutcome } from "./provider";

/**
 * Workbook 单元格 provider（计划 §4.4 v1 清单第 4 条，Package 5 接入）。
 *
 * 数据来源：已确认的 comparison mapping（targetFingerprint 绑定）→ 证据包的
 * 归一化 workbook 快照。query.reportContext.workbookCell（"Sheet!A1"）指定的
 * 单元格及其公式前驱（导入时经 Platform 适配器预算内展开并冻结在快照中）
 * 作为候选证据发射。金额取 workbook 自己的缓存值（canonical cents），
 * cached/recalculated/trust 三个通道原样保留在 EvidenceRef.workbook 中。
 */

const CELL_REF_PATTERN = /^(.+)!(\$?[A-Z]{1,3}\$?\d+)$/;
/** 公式前驱展开的确定性上限（快照中的前驱已在导入时被图预算截断）。 */
const MAX_PRECEDENT_DEPTH = 8;

interface SnapshotCellEntry {
  amountMinor: bigint | null;
  formula: string | null;
  cachedText: string | null;
  recalculatedText: string | null;
  trust: string | null;
  precedents: string[];
}

function parseCellRef(raw: string): { sheet: string; a1: string } | null {
  const match = CELL_REF_PATTERN.exec(raw.trim());
  if (!match) return null;
  return { sheet: match[1]!, a1: match[2]!.replace(/\$/g, "") };
}

function toMinor(value: unknown): bigint | null {
  try {
    if (typeof value === "number" || typeof value === "string") {
      return decimalLikeToMinorUnits(typeof value === "string" ? value.replace(/,/g, "") : value, LEDGER_MONEY_SCALE);
    }
    return null;
  } catch (error) {
    if (error instanceof DecimalNormalizationError) return null;
    throw error;
  }
}

function formatChannel(value: unknown): string | null {
  const minor = toMinor(value);
  return minor === null ? null : formatMinorUnits(minor, LEDGER_MONEY_SCALE);
}

function snapshotCellIndex(snapshot: WorkbookAnalysisSnapshot): Map<string, SnapshotCellEntry> {
  const index = new Map<string, SnapshotCellEntry>();
  for (const sheet of snapshot.dto.sheets) {
    for (const cell of sheet.cells) {
      const key = `${sheet.name}!${cell.a1}`;
      const channel = snapshot.recalculation.cells[key];
      index.set(key, {
        amountMinor: toMinor(cell.formula !== null ? cell.cachedValue : cell.value),
        formula: cell.formula,
        cachedText: formatChannel(cell.formula !== null ? cell.cachedValue : cell.value),
        recalculatedText: channel ? formatChannel(channel.recalculatedValue) : null,
        trust: channel?.trust ?? null,
        precedents: channel ? [...channel.precedents] : [],
      });
    }
  }
  return index;
}

export function workbookCellProvider(): AmountEvidenceProvider {
  return {
    sourceKind: "workbookCell",
    async collect(ctx): Promise<ProviderOutcome> {
      const reportContext = ctx.query.reportContext;
      const cellRef = reportContext?.workbookCell ? parseCellRef(reportContext.workbookCell) : null;
      if (!reportContext || !cellRef) {
        return {
          candidates: [],
          diagnostics: diagnostics("workbookCell", "skipped", {
            queryCount: 0,
            fetchedCount: 0,
            candidateCount: 0,
            note: "query 未携带 reportContext.workbookCell，workbook 证据不参与本次查询",
          }),
        };
      }

      const mapping = await ctx.db.financeStatementComparisonMapping.findFirst({
        where: {
          targetFingerprint: reportContext.target.targetFingerprint,
          status: "confirmed",
        },
        orderBy: [{ revision: "desc" }],
        select: {
          id: true,
          packageId: true,
          workbookSha256: true,
          targetCompanyId: true,
          targetCompanyCode: true,
          targetCompanyName: true,
          targetParentCompanyId: true,
          targetParentCompanyCode: true,
          targetParentCompanyName: true,
          year: true,
          month: true,
        },
      });
      if (!mapping) {
        return {
          candidates: [],
          diagnostics: diagnostics("workbookCell", "unavailable", {
            queryCount: 1,
            fetchedCount: 0,
            candidateCount: 0,
            note: "目标指纹没有已确认的 workbook 映射",
          }),
        };
      }

      const pkg = await ctx.db.financeStatementComparisonPackage.findUnique({
        where: { id: mapping.packageId },
        select: { id: true, fileName: true, sha256: true, workbookSnapshot: true },
      });
      if (!pkg || pkg.sha256 !== mapping.workbookSha256) {
        return {
          candidates: [],
          diagnostics: diagnostics("workbookCell", "unavailable", {
            queryCount: 2,
            fetchedCount: 0,
            candidateCount: 0,
            note: "证据包缺失或指纹漂移，映射已失效",
          }),
        };
      }

      const snapshot = pkg.workbookSnapshot as unknown as WorkbookAnalysisSnapshot;
      const index = snapshotCellIndex(snapshot);
      const rootKey = `${cellRef.sheet}!${cellRef.a1}`;
      if (!index.has(rootKey)) {
        return {
          candidates: [],
          diagnostics: diagnostics("workbookCell", "unavailable", {
            queryCount: 2,
            fetchedCount: 0,
            candidateCount: 0,
            note: `快照中不存在单元格 ${rootKey}`,
          }),
        };
      }

      // BFS 展开公式前驱（导入时已按图预算冻结；此处再做确定性深度/数量上限）。
      const companyId = mapping.targetCompanyId ?? mapping.targetParentCompanyId ?? null;
      const companyCode = mapping.targetCompanyCode ?? mapping.targetParentCompanyCode ?? "";
      const companyName = mapping.targetCompanyName ?? mapping.targetParentCompanyName ?? null;
      const candidates: EvidenceCandidate[] = [];
      const visited = new Set<string>([rootKey]);
      const queue: { key: string; depth: number }[] = [{ key: rootKey, depth: 0 }];
      let providerOrder = 0;
      while (queue.length > 0 && candidates.length < ctx.candidateLimit) {
        const { key, depth } = queue.shift()!;
        const entry = index.get(key);
        if (!entry) continue;
        const exclamation = key.lastIndexOf("!");
        const sheet = key.slice(0, exclamation);
        const a1 = key.slice(exclamation + 1);
        if (entry.amountMinor !== null) {
          const sourceFingerprint = fingerprintSource({
            packageId: pkg.id,
            workbookSha256: pkg.sha256,
            sheet,
            cell: a1,
            amountMinor: entry.amountMinor.toString(),
            formula: entry.formula,
          });
          const evidence: EvidenceRef = {
            evidenceId: buildEvidenceId("workbookCell", sourceFingerprint),
            sourceKind: "workbookCell",
            sourceRecordId: `comparisonPackage:${pkg.id}:${sheet}!${a1}`,
            sourceFingerprint,
            amount: formatMinorUnits(entry.amountMinor, LEDGER_MONEY_SCALE),
            currencyCode: ctx.query.currencyCode,
            company: { id: companyId, code: companyCode, name: companyName },
            date: null,
            period: mapping.year !== null && mapping.month !== null ? { year: mapping.year, month: mapping.month } : null,
            account: null,
            voucher: null,
            consolidation: null,
            workbook: {
              packageId: pkg.id,
              sheet,
              cell: a1,
              formula: entry.formula,
              cachedValue: entry.cachedText,
              recalculatedValue: entry.recalculatedText,
              trust: entry.trust,
            },
            translation: null,
            label: `${pkg.fileName} ${sheet}!${a1}`,
            deepLink: null,
          };
          candidates.push({
            evidence,
            amountMinor: entry.amountMinor,
            companyId,
            accountCode: null,
            periodKey: mapping.year !== null && mapping.month !== null
              ? `${mapping.year}-${String(mapping.month).padStart(2, "0")}`
              : null,
            lineCode: reportContext.lineCode ?? null,
            completeness: 2,
            providerOrder: providerOrder += 1,
          });
        }
        if (depth < MAX_PRECEDENT_DEPTH) {
          for (const precedent of entry.precedents) {
            if (!visited.has(precedent) && index.has(precedent)) {
              visited.add(precedent);
              queue.push({ key: precedent, depth: depth + 1 });
            }
          }
        }
      }

      const capped = queue.length > 0;
      return {
        candidates,
        diagnostics: diagnostics("workbookCell", capped ? "capped" : "ok", {
          queryCount: 2,
          fetchedCount: visited.size,
          candidateCount: candidates.length,
          ...(capped ? { note: `候选达到 provider 上限 ${ctx.candidateLimit}，按确定性顺序截断` } : {}),
        }),
      };
    },
  };
}
