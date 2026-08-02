import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { NextResponse } from "next/server";

import { getAppVersion } from "./app-version";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

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

export async function releaseHealthResponse() {
  const runtimeReady = await runtimeConfigIsTraversable();
  return NextResponse.json({
    status: runtimeReady ? "ok" : "error",
    version: getAppVersion(),
    imageDigest: process.env.RELEASE_IMAGE_DIGEST || null,
  }, {
    headers: noStoreHeaders,
    status: runtimeReady ? 200 : 503,
  });
}

export function releaseVersionResponse() {
  return NextResponse.json({
    version: getAppVersion(),
    imageDigest: process.env.RELEASE_IMAGE_DIGEST || null,
  }, { headers: noStoreHeaders });
}
