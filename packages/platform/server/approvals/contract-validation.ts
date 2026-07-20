import { getActionContractMetadata } from "../../action-contract-registry";
import { serviceError, serviceOk } from "../api";
import type {
  ApprovalAdapter,
  ApprovalOperation,
  ApprovalPreparedPayload,
  ApprovalRequestRecord,
} from "./types";

export type ApprovalValidationPhase = "draft" | "submit" | "commit";

function nullable(value: string | null | undefined) {
  return value ?? null;
}

function validateContractPhase(
  businessActionKey: string,
  phase: ApprovalValidationPhase,
  sourceActionContractVersion?: number | null,
) {
  const contract = getActionContractMetadata(businessActionKey);
  if (!contract || contract.workflow.kind !== "configurable") {
    return serviceError(`审批行为 ${businessActionKey} 缺少可执行 ActionContract`, 500);
  }
  if (
    sourceActionContractVersion !== null
    && sourceActionContractVersion !== undefined
    && sourceActionContractVersion !== contract.version
  ) {
    return serviceError(`审批行为 ${businessActionKey} 的 ActionContract 版本已变化，请重新提交`, 409);
  }
  return serviceOk({ shouldValidate: contract.workflow.validateOn.includes(phase) });
}

function assertPreparedIdentity<TPayload>(
  prepared: ApprovalPreparedPayload<TPayload>,
  expected: {
    businessActionKey: string;
    resourceKey?: string;
    scopeId?: string | null;
    subjectId?: string | null;
  },
) {
  if (prepared.businessActionKey !== expected.businessActionKey) {
    return serviceError("审批载荷返回了不匹配的业务行为", 500);
  }
  if (expected.resourceKey !== undefined && prepared.resourceKey !== expected.resourceKey) {
    return serviceError("审批载荷返回了不匹配的权限资源", 500);
  }
  if (expected.scopeId !== undefined && nullable(prepared.scopeId) !== nullable(expected.scopeId)) {
    return serviceError("审批载荷返回了不匹配的作用域", 500);
  }
  if (expected.subjectId !== undefined && nullable(prepared.subjectId) !== nullable(expected.subjectId)) {
    return serviceError("审批载荷返回了不匹配的业务对象", 500);
  }
  return serviceOk({ prepared });
}

export async function validatePreparedApprovalAtPhase<TPayload>(input: {
  adapter: ApprovalAdapter<TPayload>;
  phase: ApprovalValidationPhase;
  actorUserId: number;
  operation: ApprovalOperation;
  subjectId?: string | null;
  prepared: ApprovalPreparedPayload<TPayload>;
  businessActionKey: string;
  sourceActionContractVersion?: number | null;
  request?: ApprovalRequestRecord<TPayload>;
  expectedIdentity?: {
    resourceKey: string;
    scopeId: string | null;
    subjectId: string | null;
  };
}) {
  const phase = validateContractPhase(
    input.businessActionKey,
    input.phase,
    input.sourceActionContractVersion,
  );
  if (!phase.ok) return phase;
  if (!phase.data.shouldValidate) return serviceOk({ prepared: input.prepared });

  const validated = await input.adapter.validatePayload({
    actorUserId: input.actorUserId,
    operation: input.operation,
    subjectId: input.subjectId,
    payload: input.prepared.payload,
    request: input.request,
  });
  if (!validated.ok) return validated;
  return assertPreparedIdentity(validated.data, {
    businessActionKey: input.businessActionKey,
    ...input.expectedIdentity,
  });
}

export function validateApprovalRequestAtPhase<TPayload>(input: {
  adapter: ApprovalAdapter<TPayload>;
  phase: Exclude<ApprovalValidationPhase, "draft">;
  actorUserId: number;
  request: ApprovalRequestRecord<TPayload>;
}) {
  return validatePreparedApprovalAtPhase({
    adapter: input.adapter,
    phase: input.phase,
    actorUserId: input.actorUserId,
    operation: input.request.operation,
    subjectId: input.request.subjectId,
    prepared: {
      resourceKey: input.request.resourceKey,
      scopeId: input.request.scopeId,
      subjectId: input.request.subjectId,
      businessActionKey: input.request.businessActionKey,
      payload: input.request.latestPayload,
    },
    businessActionKey: input.request.businessActionKey,
    sourceActionContractVersion: input.request.sourceActionContractVersion,
    request: input.request,
    expectedIdentity: {
      resourceKey: input.request.resourceKey,
      scopeId: input.request.scopeId,
      subjectId: input.request.subjectId,
    },
  });
}
