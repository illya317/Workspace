import assert from "node:assert/strict";
import test from "node:test";

import type { RelationPolicyReadStore } from "@workspace/platform/server/relation-policy-config";
import { findRelationPolicyRuntimeGroup } from "@workspace/platform/server/relation-policy-runtime";
import type { ContractUpdateInput } from "../schemas";
import {
  normalizeContractConfiguredReferences,
  normalizeContractLegalInput,
} from "./administration-contract-validation";

const REQUIRED_RELATION = "administration.contracts.owner.department";

function requiredPolicyClient(): RelationPolicyReadStore {
  const group = findRelationPolicyRuntimeGroup(REQUIRED_RELATION);
  assert.ok(group);
  const row = {
    policyKey: group.policyKey,
    settingsJson: { businessRequiredByRelation: { [REQUIRED_RELATION]: "required" } },
    baselineHash: group.baselineHash,
    version: 1,
    updatedByUserId: 7,
    createdAt: new Date("2026-07-31T00:00:00.000Z"),
    updatedAt: new Date("2026-07-31T00:00:00.000Z"),
  };
  return {
    relationPolicyConfig: {
      async findUnique({ where }) {
        return where.policyKey === row.policyKey ? row : null;
      },
      async findMany() {
        return [row];
      },
    },
  };
}

test("create-mode validation rejects an omitted configured-required relation", async () => {
  const result = await normalizeContractLegalInput({} as ContractUpdateInput, {
    validateOmittedReferences: true,
    policyClient: requiredPolicyClient(),
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.issue.field, "ownerDepartmentId");
    assert.match(result.issue.message, /归口部门/);
  }
});

test("update validation does not reject a configured-required relation when it is omitted", async () => {
  const result = await normalizeContractLegalInput({} as ContractUpdateInput, {
    policyClient: requiredPolicyClient(),
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.data, {});
});

test("update validation still rejects an explicit null for a configured-required relation", async () => {
  const result = await normalizeContractLegalInput({
    ownerDepartmentId: null,
  } as ContractUpdateInput, {
    policyClient: requiredPolicyClient(),
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.issue.field, "ownerDepartmentId");
    assert.match(result.issue.message, /归口部门/);
  }
});

test("an old revision snapshot with a missing configured-required relation cannot be published", async () => {
  const result = await normalizeContractConfiguredReferences({
    owningCompanyId: null,
    ownerDepartmentId: null,
    partyAId: null,
    partyBId: null,
    handlerEmployeeId: null,
  }, true, requiredPolicyClient());

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.issue.field, "ownerDepartmentId");
    assert.match(result.issue.message, /归口部门/);
  }
});
