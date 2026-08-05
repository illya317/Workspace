/**
 * Finance 金额来源解释平台 — 公共查询/结果合同（Package 3，计划 §4.3）。
 *
 * 边界（固定，不可由调用方放宽）：
 * - 纯只读、确定性；本文件只描述 DTO，不得出现 raw Prisma payload、secrets 或原始上传字节。
 * - 结果恒为 `accountingTreatment: "not_evaluated"`；平台不推断、不批准任何会计处理。
 * - 公共金额一律为规范化十进制字符串（如 "-12124.40"）；bigint minor-unit 换算只发生在
 *   Finance 边界一次（见 server/statements/amount-explanation/decimal.ts）。
 * - LLM 只能叙述已注册的结果，不得改变算术、排序、状态或证据（计划 §4.4 第 10 步）。
 */

export type StatementTargetRef =
  | {
      kind: "entity";
      companyId: number;
      year: number;
      month: number;
      periodKind: "monthly" | "cumulative";
      reportType: "balance" | "income" | "cashflow";
      targetFingerprint: string;
    }
  | {
      kind: "consolidated";
      parentCompanyId: number;
      batchId: number;
      outputSnapshotId: number;
      reportType: "balance" | "income" | "cashflow";
      targetFingerprint: string;
    };

/**
 * 证据来源类别。v1 provider：voucherLine / consolidationMatch / reclassLineage / fxTrace；
 * workbookCell 为 Package 5 预留端口。
 */
export type EvidenceSourceKind =
  | "voucherLine"
  | "consolidationMatch"
  | "reclassLineage"
  | "fxTrace"
  | "workbookCell";

export type AmountOriginQuery = {
  targetAmount: string;
  currencyCode: string;
  companyIds?: readonly number[];
  dateFrom?: string;
  dateTo?: string;
  accountHints?: readonly string[];
  reportContext?: {
    target: StatementTargetRef;
    lineCode?: string;
    workbookCell?: string;
  };
  tolerance?: string;
  maxTerms?: number;
  sourceKinds?: readonly EvidenceSourceKind[];
};

export interface EvidenceCompanySnapshot {
  id: number | null;
  code: string;
  name: string | null;
}

export interface EvidenceAccountSnapshot {
  id: number | null;
  code: string;
  name: string;
}

export interface EvidenceVoucherRef {
  voucherId: number;
  voucherNo: string;
  voucherDate: string;
  itemId: number;
  sortOrder: number;
  counterpartAccounts: readonly EvidenceAccountSnapshot[];
}

export interface EvidenceConsolidationRef {
  batchId: number;
  matchGroupId: number | null;
  matchSourceId: number | null;
  outputSnapshotId: number | null;
  matchingRule: string | null;
  matchingVersion: string | null;
}

/** Package 5 接入；本包仅保留接口形状。 */
export interface EvidenceWorkbookRef {
  packageId: number;
  sheet: string;
  cell: string;
  formula: string | null;
  cachedValue: string | null;
  recalculatedValue: string | null;
  trust: string | null;
}

export interface EvidenceTranslationRef {
  sourceCurrency: string;
  presentationCurrency: string;
  basis: string;
  rate: number | null;
  /** 原币金额，规范化十进制字符串。 */
  sourceAmount: string;
}

/**
 * 归一化证据引用。金额保留来源符号原样（来源借 -12124.40 即 -12124.40，
 * 不得按借贷习惯转正）。`deepLink` 只允许已注册的 deep-link 元数据，禁止编造路由；
 * v1 一律为 null，路由注册属于 Package 6/7。
 */
export interface EvidenceRef {
  /** 稳定证据 ID：`ev_<sourceKind>_<sourceFingerprint 前 32 位>`。 */
  evidenceId: string;
  sourceKind: EvidenceSourceKind;
  /** 稳定源记录标识，如 `voucherItem:123`。 */
  sourceRecordId: string;
  /** 源身份字段的 sha256 指纹（hex）。 */
  sourceFingerprint: string;
  /** 精确带符号金额，规范化十进制字符串。 */
  amount: string;
  currencyCode: string;
  company: EvidenceCompanySnapshot;
  date: string | null;
  period: { year: number; month: number } | null;
  account: EvidenceAccountSnapshot | null;
  voucher: EvidenceVoucherRef | null;
  consolidation: EvidenceConsolidationRef | null;
  workbook: EvidenceWorkbookRef | null;
  translation: EvidenceTranslationRef | null;
  label: string;
  deepLink: { registryKey: string; params: Record<string, string> } | null;
}

export type AmountOriginMethod = "direct" | "formula" | "combination" | "rollforward";

export type AmountOriginStatus = "exact" | "near" | "ambiguous" | "not_found" | "truncated";

export type AmountOriginStopReason =
  | "direct_hit"
  | "complete"
  | "deadline"
  | "state_budget"
  | "candidate_limit"
  | "no_candidates"
  | "no_solution";

export interface AmountOriginExplanation {
  method: AmountOriginMethod;
  rank: number;
  evidence: readonly EvidenceRef[];
  /** 证据带符号金额合计，规范化十进制字符串。 */
  explainedAmount: string;
  /** targetAmount - explainedAmount；0 即精确解释。 */
  residualAmount: string;
}

export interface AmountOriginBudgets {
  tolerance: string;
  maxTerms: number;
  maxSolutions: number;
  maxCandidatesAfterFilter: number;
  maxVisitedStates: number;
  deadlineMs: number;
  providerCandidateLimit: number;
  /** |候选金额| 上界（|target| + tolerance），规范化十进制字符串。 */
  amountWindowUpper: string;
}

export interface AmountOriginProviderDiagnostics {
  sourceKind: EvidenceSourceKind;
  status: "ok" | "capped" | "skipped" | "unavailable";
  queryCount: number;
  fetchedCount: number;
  candidateCount: number;
  note?: string;
}

export interface AmountOriginResult {
  targetAmount: string;
  explainedAmount: string;
  residualAmount: string;
  status: AmountOriginStatus;
  /** 未命中任何解释时为 null；formula/rollforward 由后续包产出，v1 只产出 direct/combination。 */
  method: AmountOriginMethod | null;
  accountingTreatment: "not_evaluated";
  bestExplanation: AmountOriginExplanation | null;
  alternatives: readonly AmountOriginExplanation[];
  /** 候选在调 solver 前被预算截断（provider 上限或 pre-rank cap）。 */
  candidatesTruncated: boolean;
  budgets: AmountOriginBudgets;
  versions: {
    orchestrator: string;
    solverAdapterId: string | null;
    solverAdapterVersion: string | null;
  };
  fingerprints: {
    /** 规范化输入的 sha256。 */
    input: string;
    /**
     * 确定性输出投影（status/method/金额/证据 ID 序列/预算/版本/stopReason）的 sha256；
     * 耗时等易变诊断不参与指纹。
     */
    output: string;
  };
  stopReason: AmountOriginStopReason;
  diagnostics: {
    scopeQueryCount: number;
    providers: readonly AmountOriginProviderDiagnostics[];
    solver: {
      candidateCount: number;
      visitedStates: number;
      solutionCount: number;
      truncated: boolean;
    } | null;
  };
}
