import type { PerformancePeriodType } from "./performance-types";
export const PERIOD_TYPE_OPTIONS: Array<{ value: PerformancePeriodType; label: string }> = [{ value: "yearly", label: "年" },
  { value: "half_year", label: "半年" },
  { value: "quarterly", label: "季度" },
  { value: "monthly", label: "月" },
  { value: "weekly", label: "周" },
];
