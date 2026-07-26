import { deployUnitVersionResponse } from "@workspace/platform/server/deploy-unit-runtime";

export async function GET() {
  return deployUnitVersionResponse();
}
