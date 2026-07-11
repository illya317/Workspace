/**
 * 重分类规则候选 — 类型定义
 *
 * scanCandidates() 扫描指定 (companyCode, year) 下所有已过账凭证明细，
 * 找出借贷方向与科目自然余额方向相反的科目，生成规则候选。
 */

export interface ScanCandidatesParams {
  companyCode: string;
  year: number;
}

export interface RuleCandidate {
  /** 源科目编码 */
  accountCode: string;
  /** 源科目名称 */
  accountName: string;
  /** 科目自然余额方向 (debit | credit) */
  balanceDirection: string;
  /** 异常借贷方向 (debit | credit) —— 与 balanceDirection 相反 */
  abnormalSide: string;
  /** 该科目在异常方向上的合计金额 */
  abnormalAmount: number;
  /** 系统建议的目标科目编码（保守默认，v1 仅 1xxx→2241, 2xxx→1463） */
  suggestedTarget: string;
  /** 已有规则的 ID（无规则时为 null） */
  existingRuleId: number | null;
  /** 已有规则的目标科目编码（无规则时为 null） */
  existingTarget: string | null;
  /** 已有规则的来源（manual | suggested，无规则时为 null） */
  existingSource: string | null;
  /** 已有规则是否启用（无规则时为 null） */
  existingEnabled: boolean | null;
}

export interface ScanCandidatesResult {
  companyCode: string;
  year: number;
  /** 候选列表，按 abnormalAmount 降序排列 */
  candidates: RuleCandidate[];
  stats: {
    /** 有凭证明细的科目总数 */
    totalAccountsScanned: number;
    /** 存在异常方向的科目数 */
    abnormalCount: number;
    /** 已有规则的科目数 */
    withExistingRule: number;
    /** 无规则的科目数 */
    withoutRule: number;
  };
}
