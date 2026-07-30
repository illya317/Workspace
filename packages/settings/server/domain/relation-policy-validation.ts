import { preflightPhysicalRelationNulls as platformPreflightPhysicalRelationNulls } from "@workspace/platform/server/relation-policy-validation";

/** Settings-owned validation seam for policy mutations that can tighten business requiredness. */
export async function preflightPhysicalRelationNulls(
  input: Parameters<typeof platformPreflightPhysicalRelationNulls>[0],
) {
  return platformPreflightPhysicalRelationNulls(input);
}
