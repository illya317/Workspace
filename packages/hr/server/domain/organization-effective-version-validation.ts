import type { OrganizationLifecycleMeta } from "./organization-effective-version";

export * from "./organization-effective-version";

export function assertInitialOrganizationLifecycleMeta(meta: OrganizationLifecycleMeta) {
  if (meta.kind !== "schedule" || meta.expectedSequence !== 0 || !meta.idempotencyKey.trim()) {
    throw new Error("新组织结构必须使用带幂等键的初始 schedule 命令");
  }
}

export function assertPositionReportOverrideBatchLedgerInput(input: {
  positionId: number;
  meta: OrganizationLifecycleMeta;
  requestFingerprint: string;
  overrideCount: number;
  deletedIds: number[];
}) {
  if (!Number.isInteger(input.positionId) || input.positionId <= 0) {
    throw new Error("特殊汇报批量命令缺少有效岗位");
  }
  if (!input.meta.idempotencyKey.trim() || !/^[a-f0-9]{64}$/.test(input.requestFingerprint)) {
    throw new Error("特殊汇报批量命令缺少有效幂等凭证");
  }
  if (!Number.isInteger(input.overrideCount) || input.overrideCount < 0) {
    throw new Error("特殊汇报批量命令的规则数量无效");
  }
  if (input.deletedIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error("特殊汇报批量命令包含无效的删除目标");
  }
}
