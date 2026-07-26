import "server-only";

import {
  approve,
  cancel,
  comment,
  createDraft,
  getApprovalRequest,
  reject,
  revise,
  reviewUpdate,
  submit,
  withdraw,
  type ApprovalAdapter,
  type ApprovalOperation,
  type ApprovalRequestDto,
} from "./approvals";
import { serviceError } from "./api";

export type ApprovalLifecycleActionCommand = {
  actorUserId: number;
  requestId: number;
  expectedVersion?: number | null;
  comment?: string | null;
};

export function bindApprovalLifecycle<TPayload>(adapter: ApprovalAdapter<TPayload>) {
  return {
    getRequest(requestId: number) {
      return getApprovalRequest(adapter, requestId);
    },

    createDraft(input: {
      actorUserId: number;
      operation: ApprovalOperation;
      subjectId?: string | null;
      payload: unknown;
      comment?: string | null;
    }) {
      return createDraft({ adapter, ...input });
    },

    async revise(
      input: ApprovalLifecycleActionCommand & { payload?: Record<string, unknown> | null },
      mergePayload: (request: ApprovalRequestDto<TPayload>, next: Record<string, unknown>) => TPayload,
      missingPayloadMessage = "缺少流程草稿",
    ) {
      if (!input.payload) return serviceError(missingPayloadMessage, 400);
      const current = await getApprovalRequest(adapter, input.requestId);
      if (!current.ok) return current;
      const actionInput = {
        adapter,
        requestId: input.requestId,
        actorUserId: input.actorUserId,
        payload: mergePayload(current.data, input.payload),
        expectedVersion: input.expectedVersion,
        comment: input.comment,
      };
      return current.data.status === "submitted"
        ? reviewUpdate(actionInput)
        : revise(actionInput);
    },

    submit(input: ApprovalLifecycleActionCommand) {
      return submit({ adapter, ...input });
    },

    withdraw(input: ApprovalLifecycleActionCommand) {
      return withdraw({ adapter, ...input });
    },

    cancel(input: ApprovalLifecycleActionCommand) {
      return cancel({ adapter, ...input });
    },

    comment(input: ApprovalLifecycleActionCommand) {
      return comment({ adapter, ...input, comment: input.comment || "" });
    },

    approve(input: ApprovalLifecycleActionCommand) {
      return approve({ adapter, ...input });
    },

    reject(input: ApprovalLifecycleActionCommand) {
      return reject({ adapter, ...input });
    },
  };
}
