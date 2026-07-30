import assert from "node:assert/strict";
import test from "node:test";

import type { Prisma } from "@workspace/platform/server/prisma";
import { relationPolicyAdvisoryLockKey } from "@workspace/platform/server/relation-policy-config";
import {
  acquireContractBusinessRequiredPolicyLocks,
  contractBusinessRequiredPolicyKeys,
} from "./contract-business-required-policy";

test("contract writes lock every business-required policy in stable order", async () => {
  const policyKeys = contractBusinessRequiredPolicyKeys();
  const lockKeys: string[] = [];
  const tx = {
    async $queryRaw(query: { values: unknown[] }) {
      lockKeys.push(String(query.values[0]));
      return [];
    },
  } as unknown as Prisma.TransactionClient;

  await acquireContractBusinessRequiredPolicyLocks(tx);

  assert.equal(policyKeys.length, 5);
  assert.deepEqual(
    lockKeys,
    policyKeys.map(relationPolicyAdvisoryLockKey).sort(),
  );
});
