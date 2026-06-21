import "server-only";
import { NextResponse } from "next/server";
import { findApiContract } from "../api-registry";
import { getDisabledReasonForResource } from "../effective-module-registry";

export const MODULE_DISABLED_CODE = "MODULE_DISABLED";

export function moduleDisabledResponse(resourceKey?: string | null, reason?: string | null) {
  return NextResponse.json(
    {
      error: reason || "模块未启用",
      code: MODULE_DISABLED_CODE,
      resourceKey: resourceKey ?? null,
    },
    { status: 403 },
  );
}

export function disabledApiResponseForRequest(request: Request) {
  const url = new URL(request.url);
  const contract = findApiContract(request.method as Parameters<typeof findApiContract>[0], url.pathname);
  if (!contract || contract.access !== "disabled") return null;
  return moduleDisabledResponse(
    contract.resourceKey ?? contract.ownerResourceKey,
    contract.resourceKey ? getDisabledReasonForResource(contract.resourceKey) : "模块未启用",
  );
}
