export interface RvLine {
  id: number;
  lineCode: string;
  label: string;
  sortOrder: number;
  systemAmount: number;
  workpaperAmount: number;
  adjustedAmount: number | null;
  finalAmount: number;
  status: string;
  comment: string | null;
}
