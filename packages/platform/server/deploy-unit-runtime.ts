import { constants } from "node:fs";
import { access } from "node:fs/promises";
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

async function runtimeConfigIsTraversable() {
  const configRoot = process.env.WORKSPACE_CONFIG_DIR;
  if (!configRoot) return true;
  try {
    await access(configRoot, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function deployUnitHealthResponse() {
  const runtimeReady = await runtimeConfigIsTraversable();
  return NextResponse.json({
    status: runtimeReady ? "ok" : "error",
    unitId: deployUnitId(),
    version: getAppVersion(),
  }, {
    headers: noStoreHeaders,
    status: runtimeReady ? 200 : 503,
  });
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
