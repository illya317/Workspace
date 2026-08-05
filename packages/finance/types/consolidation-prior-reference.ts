import type { StatementReportType } from "./statement-shared";

export interface ConsolidationPriorLineReference {
  lineCode: string;
  cnyAmount: number;              // 上期输出该实体该行本期列 CNY
  currentMonthCnyAmount?: number; // 上期输出本月列 CNY(如有)
  sourceAmount?: number;          // 上期来源原币本期累计(勾稽用,来源不可解析时缺省)
  currentMonthSourceAmount?: number;
}

export interface ConsolidationPriorReference {
  batchId: number;
  year: number;
  month: number;
  companies: Record<number, Partial<Record<StatementReportType, ConsolidationPriorLineReference[]>>>;
  /** 上期已锁定合并报表的集团列；用于承接无法归属到单一实体的少数股东权益等合并项目。 */
  groupStatements?: Partial<Record<StatementReportType, ConsolidationPriorLineReference[]>>;
}

export interface ConsolidationPriorReferences {
  yearOpening?: ConsolidationPriorReference | null;      // (year-1)年12月批次
  comparativePeriod?: ConsolidationPriorReference | null; // (year-1)年同月批次
  monthOpening?: ConsolidationPriorReference | null;      // (year, month-1)批次
}
