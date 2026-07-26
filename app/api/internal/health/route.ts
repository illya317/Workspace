import { deployUnitHealthResponse } from "@workspace/platform/server/deploy-unit-runtime";

export function GET() {
  return deployUnitHealthResponse();
}
