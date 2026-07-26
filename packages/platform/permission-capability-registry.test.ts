import assert from "node:assert/strict";
import test from "node:test";

import { isPermissionActionGrantable } from "./permission-action-grantability";
import {
  getPermissionResourceActionPolicy,
  isPermissionActionSupported,
} from "./permission-resource-policy";
import { getResourceDef } from "./resources";

test("Work project initiation is a grantable capability without opening space-root workflow grants", () => {
  const resource = getResourceDef("work.projects.initiate");
  assert.equal(resource?.kind, "capability");
  assert.equal(resource?.capabilityOwnerKey, "work.projects");
  assert.equal(resource?.runtimeParentKey, "work.projects");

  const policy = getPermissionResourceActionPolicy("work.projects.initiate");
  assert.deepEqual(policy?.supportedActions, ["submit", "grant"]);
  assert.equal(isPermissionActionGrantable("work.projects.initiate", "submit"), true);
  assert.equal(isPermissionActionGrantable("work.projects", "submit"), false);
});

test("Work cycle and flow settings use an explicit configure capability", () => {
  const resource = getResourceDef("work.tasks.cycleFlow");
  assert.equal(resource?.kind, "capability");
  assert.equal(resource?.capabilityOwnerKey, "work.tasks");
  assert.equal(resource?.runtimeParentKey, "work.tasks");

  const policy = getPermissionResourceActionPolicy("work.tasks.cycleFlow");
  assert.deepEqual(policy?.supportedActions, ["grant", "configure"]);
  assert.equal(isPermissionActionGrantable("work.tasks.cycleFlow", "configure"), true);
  assert.equal(isPermissionActionGrantable("work.tasks", "configure"), false);
});

test("meeting full-list access is an explicit read capability", () => {
  const resource = getResourceDef("work.meetings.viewAll");
  assert.equal(resource?.kind, "capability");
  assert.equal(resource?.capabilityOwnerKey, "work.meetings");
  assert.equal(resource?.runtimeParentKey, "work.meetings");

  const policy = getPermissionResourceActionPolicy("work.meetings.viewAll");
  assert.deepEqual(policy?.supportedActions, ["read", "grant"]);
  assert.equal(isPermissionActionGrantable("work.meetings.viewAll", "read"), true);
  assert.equal(isPermissionActionSupported("work.meetings.viewAll", "entry"), false);
  assert.equal(getPermissionResourceActionPolicy("work.meetings.unknown"), null);
  assert.equal(isPermissionActionSupported("work.meetings.unknown", "read"), false);
});
