import assert from "node:assert/strict";
import test from "node:test";

import { selectFinanceGroupPolicyCompanyId } from "./group-policy-scope";

test("group policy scope follows the effective ownership chain to the top parent", () => {
  const relations = [
    { parentId: 1, childId: 3 },
    { parentId: 3, childId: 2 },
    { parentId: 2, childId: 5 },
  ];
  assert.equal(selectFinanceGroupPolicyCompanyId(5, relations), 1);
  assert.equal(selectFinanceGroupPolicyCompanyId(1, relations), 1);
});

test("group policy scope fails closed for ambiguous parents and cycles", () => {
  assert.throws(
    () => selectFinanceGroupPolicyCompanyId(2, [{ parentId: 1, childId: 2 }, { parentId: 3, childId: 2 }]),
    /多个有效内部直接母公司/,
  );
  assert.throws(
    () => selectFinanceGroupPolicyCompanyId(2, [{ parentId: 1, childId: 2 }, { parentId: 2, childId: 1 }]),
    /环路/,
  );
});
