import { NextResponse } from "next/server";

import { getAppVersion } from "./app-version";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

function deployUnitId() {
  return process.env.NEXT_PUBLIC_DEPLOY_UNIT_ID || "workspace-monolith";
}

export function deployUnitHealthResponse() {
  return NextResponse.json({
    status: "ok",
    unitId: deployUnitId(),
    version: getAppVersion(),
  }, { headers: noStoreHeaders });
}

export function deployUnitVersionResponse() {
  return NextResponse.json({
    unitId: deployUnitId(),
    version: getAppVersion(),
  }, { headers: noStoreHeaders });
}

export async function registerDeployUnitRuntime(unitId: string) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { assertDeployUnitInternalIdentity } = await import("./internal-unit-identity");
  assertDeployUnitInternalIdentity(unitId);
  const { preloadModuleRuntimeOverrides } = await import("./module-runtime-overrides");
  await preloadModuleRuntimeOverrides();
  if (unitId === "workspace-shell") {
    const { startPermissionReviewScheduler } = await import("./permission-review-scheduler");
    const { startDataQualityScheduler } = await import("./data-quality-scheduler");
    startPermissionReviewScheduler();
    startDataQualityScheduler();
  }
}
