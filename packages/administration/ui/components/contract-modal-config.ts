import type { Contract } from "@workspace/administration/types";

export interface ContractFormFieldConfig {
  label: string;
  key: keyof Contract;
  required?: boolean;
  type?: "number";
}

export const CONTRACT_FORM_FIELD_CONFIGS: ContractFormFieldConfig[] = [
  { label: "合同编号", key: "contractNo" },
  { label: "合同名称", key: "name", required: true },
  { label: "签署方", key: "partyA" },
  { label: "签署对方", key: "partyB" },
  { label: "股东方", key: "shareholder" },
  { label: "合同类型", key: "category" },
  { label: "经办人", key: "handler" },
  { label: "状态", key: "status" },
  { label: "合同金额", key: "amount", type: "number" },
  { label: "已执行金额", key: "executedAmount", type: "number" },
  { label: "文件位置", key: "location" },
];
