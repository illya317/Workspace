import assert from "node:assert/strict";
import test from "node:test";

import { defaultResourceActionAllows } from "./implicit";

test("default read resources also provide their implied entry action", () => {
  assert.equal(defaultResourceActionAllows("settings.account", "read"), true);
  assert.equal(defaultResourceActionAllows("settings.account", "entry"), true);
  assert.equal(defaultResourceActionAllows("settings.account", "update"), false);
  assert.equal(defaultResourceActionAllows("agent", "entry"), false);
});
