import { releaseVersionResponse } from "@workspace/platform/server/release-runtime";

export async function GET() {
  return releaseVersionResponse();
}
