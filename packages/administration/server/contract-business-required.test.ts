import assert from "node:assert/strict";
import test from "node:test";

import { resolveContractBusinessRequiredByRelation } from "./contracts";

test("contract list DTO exposes all five configured business-required flags", () => {
  assert.deepEqual(resolveContractBusinessRequiredByRelation({
    "administration.contracts.owning.company": "required",
    "administration.contracts.owner.department": "optional",
    "administration.contracts.party.a": "required",
    "administration.contracts.party.b": "optional",
    "administration.contracts.handler.employee": "required",
  }), {
    "administration.contracts.owning.company": true,
    "administration.contracts.owner.department": false,
    "administration.contracts.party.a": true,
    "administration.contracts.party.b": false,
    "administration.contracts.handler.employee": true,
  });
});

test("contract list DTO fails closed for an unresolved policy value", () => {
  assert.throws(
    () => resolveContractBusinessRequiredByRelation({}),
    /未解析到业务必填策略/,
  );
});
