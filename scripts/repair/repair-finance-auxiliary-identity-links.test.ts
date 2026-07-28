import assert from "node:assert/strict";
import test from "node:test";

import { resolveAuxiliaryIdentityTargets } from "./repair-finance-auxiliary-identity-links";

const members = [
  { id: 1, dimensionType: "person", sourceName: "张三", shortName: null, linkedCompanyId: null, linkedEmployeeId: null, linkedPartyId: null },
  { id: 2, dimensionType: "supplier", sourceName: "供应商甲", shortName: null, linkedCompanyId: null, linkedEmployeeId: null, linkedPartyId: null },
  { id: 3, dimensionType: "person", sourceName: "同名", shortName: null, linkedCompanyId: null, linkedEmployeeId: null, linkedPartyId: null },
];

test("resolves finance person members to employees and role members to Party", () => {
  const result = resolveAuxiliaryIdentityTargets({
    members,
    employees: [{ id: 10, name: "张三" }],
    parties: [{
      id: 20,
      subjectType: "organization",
      identityNumber: "9132X",
      name: "供应商甲有限公司",
      fullName: null,
      externalRoles: [{ category: "supplier", sourceMappings: [{ sourceName: "供应商甲" }] }],
    }],
  });

  assert.deepEqual(result.resolved.map((item) => [item.memberId, item.targetKind, item.targetId]), [
    [1, "employee", 10],
    [2, "party", 20],
  ]);
  assert.deepEqual(result.unresolvedPersonMemberIds, [3]);
});

test("fails closed for duplicate employee names and temporary personal Party", () => {
  const result = resolveAuxiliaryIdentityTargets({
    members: [members[2]!],
    employees: [{ id: 10, name: "同名" }, { id: 11, name: "同名" }],
    parties: [{
      id: 20,
      subjectType: "individual",
      identityNumber: "TEMP-20",
      name: "同名",
      fullName: null,
      externalRoles: [],
    }],
  });

  assert.equal(result.resolved.length, 0);
  assert.deepEqual(result.unresolvedPersonMemberIds, [3]);
});
