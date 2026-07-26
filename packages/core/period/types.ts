export type PeriodType = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

export interface PeriodInfo {
  year: number;
  periodIndex: number;
  date: string;
  label: string;
  dateRange: string;
}
