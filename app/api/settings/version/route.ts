import { NextResponse } from "next/server";
import { getAppVersion } from "@workspace/platform/server/app-version";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

export async function GET() {
  return NextResponse.json({ version: getAppVersion() }, { headers: noStoreHeaders });
}
