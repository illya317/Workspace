import "server-only";

import {
  createBusinessDocumentIntelligenceClient,
  type BusinessDocumentIntelligenceClient,
} from "@workspace/platform/server/business-document-intelligence-client";

const client = createBusinessDocumentIntelligenceClient({
  callerUnitId: "capital-securities",
  targetUnitId: "library",
  routeModuleKey: "library",
});

export const callBusinessDocumentIntelligence: BusinessDocumentIntelligenceClient["call"] =
  (request) => client.call(request);
