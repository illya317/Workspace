import type { Prisma } from "@workspace/platform/server/prisma";
import { acquireRelationPolicyMutationLocks } from "@workspace/platform/server/relation-policy-config";
import { relationPolicyKeysForBusinessRequiredRelations } from "@workspace/platform/server/relation-policy-validation";
import { CONTRACT_BUSINESS_REQUIRED_RELATION_KEYS } from "../contract-business-required";

export function contractBusinessRequiredPolicyKeys() {
  return relationPolicyKeysForBusinessRequiredRelations(CONTRACT_BUSINESS_REQUIRED_RELATION_KEYS);
}

/**
 * Contract writers acquire every configurable-reference policy lock in one stable order.
 * Settings acquires the matching single policy lock before preflight and CAS persistence.
 */
export async function acquireContractBusinessRequiredPolicyLocks(tx: Prisma.TransactionClient) {
  await acquireRelationPolicyMutationLocks(tx, contractBusinessRequiredPolicyKeys());
}
