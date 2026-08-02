import { releaseHealthResponse } from "@workspace/platform/server/release-runtime";

export function GET() {
  return releaseHealthResponse();
}
