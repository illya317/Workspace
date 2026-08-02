import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalNotificationPublicationFingerprint,
  legacyNotificationPublicationFingerprint,
} from "./notification-publishing-fingerprint";

const sourceA = { kind: "user-api" as const, id: "user:7", label: "旧名称" };
const sourceB = { kind: "user-api" as const, id: "user:7", label: "新名称" };
const request = {
  definitionKey: "custom.operations.reminder",
  usernames: ["zhou", "li"],
  variables: { project: "年度预算", priority: 2 },
};

test("fingerprint is canonical across ordering, source labels, and definition revisions", () => {
  const firstRequest = { ...request, revision: 1 };
  const secondRequest = {
    ...request,
    revision: 9,
    usernames: ["li", "zhou", "li"],
    variables: { priority: 2, project: "年度预算" },
  };
  const first = canonicalNotificationPublicationFingerprint(sourceA, firstRequest);
  const second = canonicalNotificationPublicationFingerprint(sourceB, secondRequest);
  assert.equal(first, second);
});

test("fingerprint changes with definition key, audience, or variables", () => {
  const baseline = canonicalNotificationPublicationFingerprint(sourceA, request);
  assert.notEqual(baseline, canonicalNotificationPublicationFingerprint(sourceA, {
    ...request,
    definitionKey: "custom.operations.escalation",
  }));
  assert.notEqual(baseline, canonicalNotificationPublicationFingerprint(sourceA, {
    ...request,
    usernames: ["li", "wang"],
  }));
  assert.notEqual(baseline, canonicalNotificationPublicationFingerprint(sourceA, {
    ...request,
    variables: { ...request.variables, priority: 3 },
  }));
});

test("fingerprint canonicalizes channels and keeps workspace as the default", () => {
  const implicitWorkspace = canonicalNotificationPublicationFingerprint(sourceA, request);
  const explicitWorkspace = canonicalNotificationPublicationFingerprint(sourceA, {
    ...request,
    deliveryChannels: ["workspace"],
  });
  assert.equal(implicitWorkspace, explicitWorkspace);
  const bothA = canonicalNotificationPublicationFingerprint(sourceA, {
    ...request,
    deliveryChannels: ["wecom", "workspace", "wecom"],
  });
  const bothB = canonicalNotificationPublicationFingerprint(sourceA, {
    ...request,
    deliveryChannels: ["workspace", "wecom"],
  });
  assert.equal(bothA, bothB);
  assert.notEqual(implicitWorkspace, bothA);
});

test("legacy fingerprint remains available for workspace-only replay compatibility", () => {
  assert.notEqual(
    canonicalNotificationPublicationFingerprint(sourceA, request),
    legacyNotificationPublicationFingerprint(sourceA, request),
  );
});
