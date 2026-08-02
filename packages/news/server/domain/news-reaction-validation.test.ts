import assert from "node:assert/strict";
import test from "node:test";

import { buildSaveNewsReactionCommand } from "./news-reaction-validation";

test("accepts clearing a reaction but rejects positional item ids", () => {
  const result = buildSaveNewsReactionCommand({
    userId: 7,
    body: { itemKey: "a".repeat(64), title: "一条资讯", reaction: null, url: "https://example.com" },
  });
  assert.equal(result.ok, true);
  const invalid = buildSaveNewsReactionCommand({
    userId: 7,
    body: { itemKey: "deep-0", title: "一条资讯", reaction: "like" },
  });
  assert.equal(invalid.ok, false);
});

test("rejects unsafe links and overlong titles", () => {
  const unsafe = buildSaveNewsReactionCommand({
    userId: 7,
    body: { itemKey: "a".repeat(64), title: "一条资讯", reaction: "like", url: "javascript:alert(1)" },
  });
  assert.equal(unsafe.ok, false);

  const overlong = buildSaveNewsReactionCommand({
    userId: 7,
    body: { itemKey: "a".repeat(64), title: "x".repeat(501), reaction: "like" },
  });
  assert.equal(overlong.ok, false);
});
