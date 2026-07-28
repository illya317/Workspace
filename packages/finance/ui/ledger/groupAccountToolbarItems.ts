import type { SurfaceToolbarItem } from "@workspace/core/ui";
import type { FinanceGroupAccountReviewStatus, FinanceGroupAccountUsage } from "@workspace/finance/types";

import {
  GROUP_ACCOUNT_USAGE_FILTER_OPTIONS,
  REVIEW_STATUS_FILTER_OPTIONS,
} from "./groupAccountMappingPresentation";

/** @ui-structural-declaration 集团科目低频筛选的声明式 Toolbar 结构。 */
export function groupAccountFilterPanelItem({
  category,
  accountUsage,
  reviewStatus,
  onCategoryChange,
  onAccountUsageChange,
  onReviewStatusChange,
  onReset,
}: {
  category: string;
  accountUsage: "" | FinanceGroupAccountUsage;
  reviewStatus: "" | FinanceGroupAccountReviewStatus;
  onCategoryChange: (value: string) => void;
  onAccountUsageChange: (value: "" | FinanceGroupAccountUsage) => void;
  onReviewStatusChange: (value: "" | FinanceGroupAccountReviewStatus) => void;
  onReset: () => void;
}): SurfaceToolbarItem {
  return {
    kind: "filter-panel",
    key: "group-account-filters",
    label: "筛选",
    fields: [
      {
        key: "category",
        label: "科目类型",
        value: category,
        allLabel: "全部",
        options: [
          { value: "asset", label: "资产" },
          { value: "liability", label: "负债" },
          { value: "common", label: "共同" },
          { value: "equity", label: "权益" },
          { value: "cost", label: "成本" },
          { value: "revenue", label: "收入" },
          { value: "expense", label: "费用" },
        ],
        onChange: onCategoryChange,
      },
      {
        key: "account-usage",
        label: "科目范围",
        value: accountUsage,
        allLabel: "全部科目",
        options: [...GROUP_ACCOUNT_USAGE_FILTER_OPTIONS],
        onChange: (value) => onAccountUsageChange(value as "" | FinanceGroupAccountUsage),
      },
      {
        key: "review-status",
        label: "复核状态",
        value: reviewStatus,
        allLabel: "全部",
        options: [...REVIEW_STATUS_FILTER_OPTIONS],
        onChange: (value) => onReviewStatusChange(value as "" | FinanceGroupAccountReviewStatus),
      },
    ],
    onReset,
  };
}
