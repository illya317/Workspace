import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { Prisma } from "@workspace/platform/server/prisma";
import { employmentIsActiveOnDate } from "@workspace/platform/server/relation-registry";
import type { Contract } from "@workspace/administration/types";
import { canHardDeleteContractFacts } from "./domain/contract-lifecycle-policy";

export const CONTRACT_INCLUDE = {
  category: { select: { id: true, name: true } },
  owningCompany: { select: { id: true, party: { select: { name: true, fullName: true } } } },
  ownerDepartment: { select: { id: true, name: true } },
  partyAIdentity: { select: { id: true, name: true, fullName: true } },
  partyBIdentity: { select: { id: true, name: true, fullName: true } },
  handlerEmployee: {
    select: {
      name: true,
      employments: { select: { isActive: true, joinDate: true, leaveDate: true } },
    },
  },
  revisions: { select: { recordState: true } },
  _count: { select: { attachments: true, records: true, stateEvents: true } },
} satisfies Prisma.ContractInclude;

export type ContractRecord = Prisma.ContractGetPayload<{ include: typeof CONTRACT_INCLUDE }>;

function isoDate(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function identityName(value: { name: string; fullName: string | null } | null) {
  return value?.fullName || value?.name || null;
}

function dataQualityIssues(contract: ContractRecord, duplicateContractNumbers: ReadonlySet<string>) {
  const issues: string[] = [];
  if (!contract.contractNo) issues.push("缺少合同编号");
  else if (duplicateContractNumbers.has(contract.contractNo)) issues.push("合同编号重复");
  if (contract.category.name === "待补全") issues.push("缺少合同类型");
  if (!contract.partyA) issues.push("缺少甲方名称");
  if (!contract.partyB) issues.push("缺少乙方名称");
  if (!contract.partyAId) issues.push("甲方未关联主体主数据");
  if (!contract.partyBId) issues.push("乙方未关联主体主数据");
  if (!contract.handlerEmployeeId) issues.push("缺少经办人");
  if (contract.lifecycleStatus === "unknown") issues.push("合同状态待确认");
  if (contract.signatureStatus === "unknown") issues.push("签署状态待确认");
  if (contract.performanceStatus === "unknown") issues.push("履行状态待确认");
  if (contract.legacySignDateRaw && !contract.signedOn) issues.push("签订日期精度不足");
  if (contract.legacyEndDateRaw && !contract.expiresOn) issues.push("结束日期精度不足");
  if (contract.amount?.isNegative()) issues.push("合同金额为负数");
  if (contract.confidentialityLevel >= 3 && !contract.handlerEmployeeId && !contract.ownerDepartmentId) {
    issues.push("机密合同缺少责任归属");
  }
  return issues;
}

export function toContractDto(
  contract: ContractRecord,
  duplicateContractNumbers: ReadonlySet<string> = new Set(),
): Contract {
  const {
    category,
    owningCompany,
    ownerDepartment,
    partyAIdentity,
    partyBIdentity,
    handlerEmployee,
    revisions,
    _count,
    amount,
    executedAmount,
    signedOn,
    expiresOn,
    approvedOn,
    approvalSyncedAt,
    ...record
  } = contract;
  return {
    ...record,
    amount: amount === null ? null : amount.toNumber(),
    executedAmount: executedAmount === null ? null : executedAmount.toNumber(),
    signedOn: isoDate(signedOn),
    expiresOn: isoDate(expiresOn),
    approvedOn: isoDate(approvedOn),
    approvalSyncedAt: approvalSyncedAt?.toISOString() ?? null,
    lifecycleStatus: record.lifecycleStatus as Contract["lifecycleStatus"],
    signatureStatus: record.signatureStatus as Contract["signatureStatus"],
    performanceStatus: record.performanceStatus as Contract["performanceStatus"],
    archivedAt: record.archivedAt?.toISOString() ?? null,
    editedAt: record.editedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    categoryName: category.name,
    owningCompanyName: identityName(owningCompany?.party ?? null),
    ownerDepartmentName: ownerDepartment?.name ?? null,
    partyAIdentityName: identityName(partyAIdentity),
    partyBIdentityName: identityName(partyBIdentity),
    handlerEmployeeName: handlerEmployee?.name ?? null,
    handlerEmployeeActive: handlerEmployee?.employments.some((employment) => (
      employmentIsActiveOnDate(employment, workspaceBusinessDate(new Date()))
    )) ?? null,
    dataQualityIssues: dataQualityIssues(contract, duplicateContractNumbers),
    canHardDelete: canHardDeleteContractFacts({
      lifecycleStatus: contract.lifecycleStatus,
      isArchived: contract.isArchived,
      currentRevisionId: contract.currentRevisionId,
      approvalSourceKey: contract.approvalSourceKey,
      attachmentCount: _count.attachments,
      recordCount: _count.records,
      stateEventCount: _count.stateEvents,
      revisionStates: revisions.map((revision) => revision.recordState),
    }),
  };
}

export function dateAtBusinessDay(value: Date = new Date()) {
  return new Date(`${workspaceBusinessDate(value)}T00:00:00.000Z`);
}
