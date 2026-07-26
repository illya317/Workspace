import assert from "node:assert/strict";
import test from "node:test";

import { matchesStatementSourceCompany } from "./source-company";

test("statement source company matching ignores spacing and English legal-name punctuation", () => {
  assert.equal(matchesStatementSourceCompany(
    "The Palace Institute of Medical Biology  Co. LTD",
    ["The Palace Institute of Medical Biology Co Ltd"],
  ), true);
});

test("statement source company matching still rejects a different legal entity", () => {
  assert.equal(matchesStatementSourceCompany(
    "Palace Therapeutics LTD.",
    ["The Palace Institute of Medical Biology Co Ltd"],
  ), false);
});

test("statement source company matching keeps Chinese legal suffix compatibility", () => {
  assert.equal(matchesStatementSourceCompany("示例集团有限公司", ["示例集团"]), true);
  assert.equal(matchesStatementSourceCompany("", ["示例集团有限公司"]), false);
});
