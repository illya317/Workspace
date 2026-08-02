import { serviceError, serviceOk, type ServiceResult } from "../../service-result";
import type { Prisma } from "../prisma";
import { notifyApproval } from "./notifications";
import {
  applyApprovalTransition,
  assertApprovalVersion,
  loadApprovalRecord,
} from "./store";
import type {
  ApprovalAdapter,
  ApprovalEventType,
  ApprovalRequestRecord,
  ApprovalStatus,
} from "./types";

export async function transitionApprovalWithNotification<TPayload>(
  adapter: ApprovalAdapter<TPayload>,
  input: {
    requestId: number;
    actorUserId: number;
    expectedVersion?: number | null;
    eventType: ApprovalEventType;
    allowedFrom: ApprovalStatus[];
    toStatus: ApprovalStatus;
    comment?: string | null;
    updateData?: Prisma.ApprovalRequestUncheckedUpdateInput;
    authorize: (
      request: ApprovalRequestRecord<TPayload>,
    ) => Promise<ServiceResult<{ ok: true }>> | ServiceResult<{ ok: true }>;
  },
) {
  const request = await loadApprovalRecord(adapter, input.requestId);
  if (!request.ok) return request;
  if (!input.allowedFrom.includes(request.data.status)) {
    return serviceError("当前状态不能执行该操作", 409);
  }
  const version = assertApprovalVersion(request.data, input.expectedVersion);
  if (!version.ok) return version;
  const access = await input.authorize(request.data);
  if (!access.ok) return access;
  const updated = await applyApprovalTransition(adapter, {
    request: request.data,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    toStatus: input.toStatus,
    comment: input.comment,
    updateData: input.updateData,
  });
  if (!updated.ok) return updated;
  await notifyApproval(adapter, input.eventType, updated.data.record, input.actorUserId);
  return serviceOk({ request: updated.data.dto });
}
