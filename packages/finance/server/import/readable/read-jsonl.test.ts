import assert from "node:assert/strict";
import test from "node:test";

import { fixGBK } from "../shared";
import { firstUnreadableText } from "./read-jsonl";

test("repairs T6 latin1-decoded GB18030 punctuation without changing clean text", () => {
  assert.equal(fixGBK("3£¥"), "3％");
  assert.equal(fixGBK("T¡çTSupermarket"), "T＄TSupermarket");
  assert.equal(fixGBK("示例集团有限公司"), "示例集团有限公司");
  assert.equal(fixGBK("T&T Supermarket"), "T&T Supermarket");
});

test("finds unresolved encoding damage before readable facts are committed", () => {
  assert.equal(firstUnreadableText({ accounts: [{ name: "应付账款" }] }), null);
  assert.equal(firstUnreadableText({ accounts: [{ name: "其他应付£¥" }] }), "batch.accounts[0].name");
  assert.equal(firstUnreadableText({ vouchers: [{ description: "损坏�摘要" }] }), "batch.vouchers[0].description");
});
