import assert from "node:assert/strict";
import test from "node:test";

import { defaultResourceActionAllows } from "./implicit";

test("default read resources also provide their implied entry action", () => {
  assert.equal(defaultResourceActionAllows("settings.account", "read"), true);
  assert.equal(defaultResourceActionAllows("settings.account", "entry"), true);
  assert.equal(defaultResourceActionAllows("settings.account", "update"), false);
  assert.equal(defaultResourceActionAllows("agent", "entry"), false);
  assert.equal(defaultResourceActionAllows("docs.company", "read"), true);
  assert.equal(defaultResourceActionAllows("docs.company", "entry"), true);
  assert.equal(defaultResourceActionAllows("docs.company", "update"), false);
  assert.equal(defaultResourceActionAllows("news", "create"), true);
  assert.equal(defaultResourceActionAllows("news", "read"), true);
  assert.equal(defaultResourceActionAllows("news", "entry"), true);
  assert.equal(defaultResourceActionAllows("news", "update"), false);
});
