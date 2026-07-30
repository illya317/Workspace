import assert from "node:assert/strict";
import test from "node:test";

import {
  contractFormFields,
  missingRequiredContractRelationLabels,
} from "./contract-form";

const requiredByRelation = {
  "administration.contracts.owning.company": false,
  "administration.contracts.owner.department": true,
  "administration.contracts.party.a": false,
  "administration.contracts.party.b": true,
  "administration.contracts.handler.employee": false,
};

test("contract form marks configured-required reference fields", () => {
  const fields = contractFormFields({}, () => undefined, {
    locations: [],
    categories: [],
    businessRequiredByRelation: requiredByRelation,
  });
  const required = fields.find((field) => field.key === "ownerDepartmentId");
  const optional = fields.find((field) => field.key === "owningCompanyId");

  assert.ok(required);
  assert.equal(required.required, true);
  assert.deepEqual(required.spec.validation, { required: true });
  assert.ok(optional);
  assert.equal(optional.required, false);
  assert.equal(optional.spec.validation, undefined);
});

test("contract submission eligibility reports only missing configured-required references", () => {
  assert.deepEqual(missingRequiredContractRelationLabels({
    ownerDepartmentId: null,
    partyBId: 23,
  }, requiredByRelation), ["归口部门"]);

  assert.deepEqual(missingRequiredContractRelationLabels({
    ownerDepartmentId: 12,
    partyBId: null,
  }, requiredByRelation), ["乙方主体"]);

  assert.deepEqual(missingRequiredContractRelationLabels({
    ownerDepartmentId: 12,
    partyBId: 23,
  }, requiredByRelation), []);
});
