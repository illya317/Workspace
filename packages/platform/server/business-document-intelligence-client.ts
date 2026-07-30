import "server-only";

import type {
  BusinessDocumentIntelligenceRequest,
  BusinessDocumentIntelligenceResponse,
} from "./business-document-intelligence-contract";
import { callWorkspaceInternalJson } from "./internal-unit-rpc";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const UNIT_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const ROUTE_MODULE_KEY_PATTERN = /^[a-z][a-zA-Z0-9-]*$/;

export interface BusinessDocumentIntelligenceClient {
  call(request: BusinessDocumentIntelligenceRequest): Promise<BusinessDocumentIntelligenceResponse>;
}

export type BusinessDocumentIntelligenceClientIdentity = Readonly<{
  callerUnitId: string;
  targetUnitId: string;
  routeModuleKey: string;
}>;

export function createBusinessDocumentIntelligenceClient(
  identity: BusinessDocumentIntelligenceClientIdentity,
): BusinessDocumentIntelligenceClient {
  assertUnitId("callerUnitId", identity.callerUnitId);
  assertUnitId("targetUnitId", identity.targetUnitId);
  if (!ROUTE_MODULE_KEY_PATTERN.test(identity.routeModuleKey)) {
    throw new Error(`Business document intelligence route module key is invalid: ${identity.routeModuleKey}`);
  }
  const path = `/api/modules/${identity.routeModuleKey}/internal/business-document-intelligence`;
  return {
    call: (request) => callWorkspaceInternalJson({
      body: request,
      callerUnitId: identity.callerUnitId,
      targetUnitId: identity.targetUnitId,
      path,
      maxResponseBytes: MAX_RESPONSE_BYTES,
    }),
  };
}

function assertUnitId(field: "callerUnitId" | "targetUnitId", value: string) {
  if (!UNIT_ID_PATTERN.test(value)) {
    throw new Error(`Business document intelligence ${field} is invalid: ${value}`);
  }
}
