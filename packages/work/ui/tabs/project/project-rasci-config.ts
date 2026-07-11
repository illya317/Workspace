import type { MultiProjectRole } from "./model";

export type RasciColumn = {
  key: "A" | "R" | "S" | "C" | "I";
  label: string;
  role: "负责人" | MultiProjectRole;
};

export const PROJECT_RASCI_COLUMN_DEFS: RasciColumn[] = [
  { key: "A", label: "负责", role: "负责人" },
  { key: "R", label: "执行", role: "执行负责" },
  { key: "S", label: "协作", role: "支持协作" },
  { key: "C", label: "咨询", role: "咨询参与" },
  { key: "I", label: "知会", role: "知会" },
];
