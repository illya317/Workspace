import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTRACT_BUSINESS_REQUIRED_RELATION_KEYS,
  contractBusinessRequiredPoliciesReady,
} from "./contract-business-required";

test("contract business-required policies are ready only when every governed relation is present", () => {
  assert.equal(contractBusinessRequiredPoliciesReady({}), false);
  assert.equal(contractBusinessRequiredPoliciesReady({
    [CONTRACT_BUSINESS_REQUIRED_RELATION_KEYS[0]]: false,
  }), false);
  assert.equal(contractBusinessRequiredPoliciesReady(Object.fromEntries(
    CONTRACT_BUSINESS_REQUIRED_RELATION_KEYS.map((relationKey) => [relationKey, false]),
  )), true);
});
