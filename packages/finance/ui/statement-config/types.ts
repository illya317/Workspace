export type StatementOperator = "add" | "subtract" | "exclude";

export interface LineCfg {
  lineCode: string;
  label: string;
  section: string;
  reclassSource: boolean;
  reclassTarget: boolean;
  isHeader: boolean;
  isTotal: boolean;
  isGrandTotal: boolean;
}

export interface Mapping {
  accountCode: string;
  lineCode: string;
  operator: StatementOperator;
  source: string;
}

export interface AcctInfo {
  code: string;
  name: string;
  closingDebit: number;
  closingCredit: number;
}

export interface ApiLineCfg {
  lineCode: string;
  label: string;
  section: string;
  reclassSource?: boolean;
  reclassTarget?: boolean;
  isHeader?: boolean;
  isTotal?: boolean;
  isGrandTotal?: boolean;
}

export interface ApiTreeNode {
  accountCode: string;
  accountName: string;
  closingDebit: number;
  closingCredit: number;
  resolvedLineCode: string | null;
  effectiveOperator: StatementOperator | null;
  mappingSource: "explicit" | "inherited" | "none";
  children: ApiTreeNode[];
}

export interface InheritedAcct {
  accountCode: string;
  accountName: string;
  closingDebit: number;
  closingCredit: number;
}

export interface ApiErrorBody {
  error?: string;
}

export type LineTableRow =
  | { id: string; kind: "section"; section: string }
  | { id: string; kind: "special"; line: LineCfg }
  | {
      id: string;
      kind: "line";
      line: LineCfg;
      mappings: Mapping[];
      inheritedAccounts: InheritedAcct[];
      accountCount: number;
      expanded: boolean;
    };

export const SECTIONS: Record<string, string> = {
  currentAssets: "流动资产",
  nonCurrentAssets: "非流动资产",
  currentLiabilities: "流动负债",
  nonCurrentLiabilities: "非流动负债",
  equity: "所有者权益",
  liabilities: "负债",
};

export const SECTION_ORDER = [
  "currentAssets",
  "nonCurrentAssets",
  "currentLiabilities",
  "nonCurrentLiabilities",
  "equity",
];

export function formatStatementAmount(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function isDefaultMapping(mapping: Mapping) {
  return ["default", "migrated", "copied"].includes(mapping.source);
}
