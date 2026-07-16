import assert from "node:assert/strict";
import test from "node:test";

import { validateAgentActorUserFieldChange } from "./actor-user-policy";

test("ordinary user administration cannot make an Agent actor login-capable", () => {
  assert.match(validateAgentActorUserFieldChange({
    profileKey: "development.architecture",
    field: "canLogin",
    value: true,
  }) ?? "", /禁止登录/);
  assert.equal(validateAgentActorUserFieldChange({
    profileKey: "development.architecture",
    field: "canLogin",
    value: false,
  }), null);
});

test("ordinary user administration cannot rewrite Agent actor identity bindings", () => {
  for (const field of ["username", "employeeId"] as const) {
    assert.match(validateAgentActorUserFieldChange({
      profileKey: "development.operations",
      field,
      value: "changed",
    }) ?? "", /provisioning/);
  }
  assert.equal(validateAgentActorUserFieldChange({
    profileKey: null,
    field: "username",
    value: "human-user",
  }), null);
});
