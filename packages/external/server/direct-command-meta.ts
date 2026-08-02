import type { ExternalPartyCategory } from "@workspace/external/types";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { directCommandId } from "@workspace/platform/server/direct-command-meta";
import type { ExternalPartyRoleEndInput } from "./schemas";

export function externalDirectCommandId(request: Request) {
  return directCommandId(request);
}

export function externalDirectRoleEndInput(
  category: ExternalPartyCategory,
  input: { effectiveOn?: string; reason?: string | null } = {},
): ExternalPartyRoleEndInput {
  return {
    effectiveOn: input.effectiveOn?.trim() || workspaceBusinessDate(new Date()),
    reason: input.reason?.trim() || `直接停用${category === "customer" ? "客户" : "供应商"}角色`,
  };
}
