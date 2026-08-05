import type {
  EvidenceSourceKind,
  StatementTargetRef,
} from "@workspace/finance/types/statement-explanation";

/**
 * amount-explanation 的共享结构类型（contract 层）。
 * 运行逻辑在 query.ts/scope.ts；providers 等 contract 角色文件只允许依赖这里的类型。
 */

export interface NormalizedReportContext {
  target: StatementTargetRef;
  lineCode: string | null;
  workbookCell: string | null;
}

export interface NormalizedQuery {
  targetMinor: bigint;
  toleranceMinor: bigint;
  scale: number;
  currencyCode: string;
  companyIds: readonly number[] | null;
  dateFrom: string | null;
  dateTo: string | null;
  accountHints: readonly string[];
  reportContext: NormalizedReportContext | null;
  maxTerms: number;
  sourceKinds: ReadonlySet<EvidenceSourceKind>;
}

export interface ScopeCompany {
  id: number | null;
  code: string;
  name: string | null;
}

export interface ScopePeriod {
  id: number;
  year: number;
  month: number;
  companyCode: string;
}

/**
 * 有界查询范围：所有 provider 的强制谓词都从这里取。
 * 任何路径都必须先落到公司集合 + dateTo 上界；不允许出现无界账簿扫描。
 */
export interface ExplanationScope {
  companies: readonly ScopeCompany[];
  companyCodes: readonly string[];
  companyIds: readonly number[];
  dateFrom: string | null;
  dateTo: string;
  /** consolidation provider 的批次范围（按期间倒序，最多 12 个）。 */
  batchIds: readonly number[];
  batchPeriod: { year: number; month: number } | null;
  outputSnapshotByBatch: ReadonlyMap<number, number>;
  /** reclass provider 的期间范围（公司 × 月，已按日期窗口过滤）。 */
  periods: readonly ScopePeriod[];
  queryCount: number;
}
