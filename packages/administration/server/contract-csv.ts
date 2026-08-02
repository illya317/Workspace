import {
  CONTRACT_LIFECYCLE_OPTIONS,
  CONTRACT_PERFORMANCE_OPTIONS,
  CONTRACT_SIGNATURE_OPTIONS,
  contractOptionLabel,
  type Contract,
} from "@workspace/administration/types";

export function renderContractsCsv(contracts: readonly Contract[]) {
  const header = [
    "ID", "系统标识", "版本", "合同编号", "合同名称", "合同类型", "甲方", "乙方", "股东",
    "归属公司", "归口部门", "合同内容", "经办人", "签订日期", "结束日期", "合同状态",
    "签署状态", "履行状态", "合同金额", "已执行金额", "币种", "保密级别", "文件位置", "备注", "数据质量问题",
  ];
  const rows = contracts.map((contract) => [
    contract.id,
    contract.contractUid,
    contract.version,
    contract.contractNo,
    contract.name,
    contract.categoryName,
    contract.partyA,
    contract.partyB,
    contract.shareholder,
    contract.owningCompanyName,
    contract.ownerDepartmentName,
    contract.content,
    contract.handlerEmployeeName,
    contract.signedOn,
    contract.expiresOn,
    contractOptionLabel(CONTRACT_LIFECYCLE_OPTIONS, contract.lifecycleStatus),
    contractOptionLabel(CONTRACT_SIGNATURE_OPTIONS, contract.signatureStatus),
    contractOptionLabel(CONTRACT_PERFORMANCE_OPTIONS, contract.performanceStatus),
    contract.amount,
    contract.executedAmount,
    contract.currencyCode,
    contract.confidentialityLevel,
    contract.location,
    contract.remark,
    contract.dataQualityIssues.join("；"),
  ]);
  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function escapeCsvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
