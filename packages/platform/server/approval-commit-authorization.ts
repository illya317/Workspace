import { serviceError, serviceOk } from "./api";
import type { ApprovalCommitAuthorization } from "./approval-commit-authorization-contract";

export type { ApprovalCommitAuthorization } from "./approval-commit-authorization-contract";

type ApprovalCommitBinding = {
  requestId: number;
  requestVersion: number;
  businessActionKey: string;
};

const issuedAuthorizations = new WeakMap<object, ApprovalCommitBinding>();

/** Internal issuer. A source boundary gate permits calls only from the approval engine. */
export function issueApprovalCommitAuthorization(
  binding: ApprovalCommitBinding,
): ApprovalCommitAuthorization {
  const authorization = Object.freeze({});
  issuedAuthorizations.set(authorization, { ...binding });
  return authorization as ApprovalCommitAuthorization;
}

export function consumeApprovalCommitAuthorization(input: {
  authorization: ApprovalCommitAuthorization;
  requestId: number;
  requestVersion: number;
  businessActionKey: string;
}) {
  if (!input.authorization || typeof input.authorization !== "object") {
    return serviceError("批准后的业务写入缺少审批引擎授权", 500);
  }
  const binding = issuedAuthorizations.get(input.authorization);
  if (!binding) return serviceError("批准后的业务写入授权无效或已使用", 500);
  issuedAuthorizations.delete(input.authorization);
  if (
    binding.requestId !== input.requestId
    || binding.requestVersion !== input.requestVersion
    || binding.businessActionKey !== input.businessActionKey
  ) {
    return serviceError("批准后的业务写入与审批请求不匹配", 500);
  }
  return serviceOk(binding);
}
