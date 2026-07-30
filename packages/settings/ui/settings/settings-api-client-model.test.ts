import assert from "node:assert/strict";
import test from "node:test";

import { parseSettingsApiTab } from "./settings-api-client-model";

test("settings API tabs keep notifications on the shared page", () => {
  assert.equal(parseSettingsApiTab("notifications", true), "notifications");
  assert.equal(parseSettingsApiTab("groups", true), "groups");
  assert.equal(parseSettingsApiTab("clients", true), "clients");
});

test("settings API tabs fail closed when notification access is missing", () => {
  assert.equal(parseSettingsApiTab("notifications", false), "catalog");
  assert.equal(parseSettingsApiTab("groups", false), "catalog");
  assert.equal(parseSettingsApiTab("unknown", true), "catalog");
  assert.equal(parseSettingsApiTab(null, true), "catalog");
});
