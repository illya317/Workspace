import type { FinanceGroupVoucherDocumentType } from "@workspace/finance/types";

export const GROUP_VOUCHER_DOCUMENT_TYPE_OPTIONS: Array<{
  value: "" | FinanceGroupVoucherDocumentType;
  label: string;
}> = [
  { value: "", label: "全部类别" },
  { value: "groupAdjustment", label: "集团调整" },
  { value: "elimination", label: "内部抵销" },
  { value: "reclassification", label: "列报重分类" },
  { value: "allocation", label: "少数股东分配" },
];
