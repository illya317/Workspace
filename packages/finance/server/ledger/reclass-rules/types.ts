/**
 * 重分类规则候选 — 类型定义
 *
 * scanCandidates() 返回支持按辅助期末余额重分类的配对科目。
 */

export interface RuleCandidate {
  /** 源科目编码 */
  accountCode: string;
  /** 源科目名称 */
  accountName: string;
  /** 科目自然余额方向 (debit | credit) */
  balanceDirection: string;
  /** 异常借贷方向 (debit | credit) —— 与 balanceDirection 相反 */
  abnormalSide: "debit" | "credit" | "both";
  /** 辅助余额导入前不预估金额，固定为 0 */
  abnormalAmount: number;
  /** 已有规则的 ID（无规则时为 null） */
  existingRuleId: number | null;
  /** 已有规则的目标科目编码（无规则时为 null） */
  existingTarget: string | null;
  /** 人工确认结论；无规则时为 null。 */
  existingDecision: "reclassify" | "no_reclass" | null;
  /** 已有规则的来源（manual | suggested，无规则时为 null） */
  existingSource: string | null;
  /** 已有规则是否启用（无规则时为 null） */
  existingEnabled: boolean | null;
}

export interface GroupAccountOption {
  code: string;
  name: string;
}

export interface ScanCandidatesResult {
  /** 集团所有公司、年度有效科目的编码并集。 */
  accountOptions: GroupAccountOption[];
  /** 集团科目并集；每一项都等待或承载人工确认结论。 */
  candidates: RuleCandidate[];
  stats: {
    /** 集团科目并集数量。 */
    totalGroupAccounts: number;
    reclassified: number;
    noReclass: number;
    unconfirmed: number;
  };
}
