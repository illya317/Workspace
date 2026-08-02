import assert from "node:assert/strict";
import test from "node:test";

import {
  notificationDefinitionSaveSchema,
  prepareNotificationDefinition,
  renderNotificationDefinition,
} from "./notification-definition-dsl";

function definition(overrides: Record<string, unknown> = {}) {
  return notificationDefinitionSaveSchema.parse({
    key: "custom.operations.reminder",
    label: "运营提醒",
    titleTemplate: "{{project_name}}待处理",
    bodyTemplate: "负责人 {{owner_name}}，请处理 {{project_name}}。",
    hrefTemplate: "/work/projects/{{project_id}}",
    responseMode: "acknowledge",
    isImportant: true,
    allowProjectMonitoring: true,
    allowUserApi: true,
    allowedOpenApiClientIds: [3, 2, 3],
    ...overrides,
  });
}

test("definition derives unique sorted flat variables and renders content", () => {
  const prepared = prepareNotificationDefinition(definition());
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.deepEqual(prepared.data.variableKeys, ["owner_name", "project_id", "project_name"]);
  assert.deepEqual(prepared.data.allowedOpenApiClientIds, [2, 3]);
  assert.equal(prepared.data.allowProjectMonitoring, true);
  const rendered = renderNotificationDefinition(prepared.data, {
    owner_name: "王敏",
    project_id: 42,
    project_name: "年度预算",
  });
  assert.deepEqual(rendered, {
    ok: true,
    data: {
      title: "年度预算待处理",
      body: "负责人 王敏，请处理 年度预算。",
      href: "/work/projects/42",
    },
  });
});

test("project monitoring grant defaults off and is part of the immutable content fingerprint", () => {
  const denied = prepareNotificationDefinition(definition({ allowProjectMonitoring: false }));
  const allowed = prepareNotificationDefinition(definition({ allowProjectMonitoring: true }));
  assert.equal(denied.ok, true);
  assert.equal(allowed.ok, true);
  if (!denied.ok || !allowed.ok) return;
  assert.equal(denied.data.allowProjectMonitoring, false);
  assert.notEqual(denied.data.contentFingerprint, allowed.data.contentFingerprint);
});

test("href variables are percent encoded without escaping static route delimiters", () => {
  const prepared = prepareNotificationDefinition(definition({
    hrefTemplate: "/work/projects/{{project_id}}?return={{return_path}}",
  }));
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const rendered = renderNotificationDefinition(prepared.data, {
    owner_name: "王敏",
    project_id: "north/42",
    project_name: "年度预算",
    return_path: "/work?tab=待办",
  });
  assert.equal(rendered.ok, true);
  if (!rendered.ok) return;
  assert.equal(rendered.data.href, "/work/projects/north%2F42?return=%2Fwork%3Ftab%3D%E5%BE%85%E5%8A%9E");
});

test("render rejects missing and unknown variables", () => {
  const prepared = prepareNotificationDefinition(definition());
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const missing = renderNotificationDefinition(prepared.data, { owner_name: "王敏", project_id: 42 });
  assert.equal(missing.ok, false);
  const unknown = renderNotificationDefinition(prepared.data, {
    owner_name: "王敏",
    project_id: 42,
    project_name: "年度预算",
    extra: "x",
  });
  assert.equal(unknown.ok, false);
});

test("definition and render reject external or protocol-relative hrefs", () => {
  const external = prepareNotificationDefinition(definition({ hrefTemplate: "https://example.com/{{project_id}}" }));
  assert.equal(external.ok, false);
  const protocolRelative = prepareNotificationDefinition(definition({ hrefTemplate: "//example.com/{{project_id}}" }));
  assert.equal(protocolRelative.ok, false);
});

test("API href validation strips deployment base paths without blocking settings UI routes", () => {
  const blockedApiHrefs = [
    "/api/notifications",
    "/work/../api/notifications",
    "/%61pi/notifications",
    "/test/api/notifications",
    "/workspace/api/notifications",
    "/test/%61pi/notifications",
    "/workspace/routes/../api/notifications",
    "/workspace//api/notifications",
    "/test/%2fapi/notifications",
  ];
  for (const hrefTemplate of blockedApiHrefs) {
    const prepared = prepareNotificationDefinition(definition({ hrefTemplate }));
    assert.deepEqual(prepared, {
      ok: false,
      issue: { message: "通知链接不能指向 API 路径", status: 400, field: "href" },
    }, hrefTemplate);
  }

  const allowedUiRoute = prepareNotificationDefinition(definition({
    hrefTemplate: "/settings/api?tab=notifications",
  }));
  assert.equal(allowedUiRoute.ok, true);

  const renderedBasePathApi = renderNotificationDefinition({
    titleTemplate: "提醒",
    bodyTemplate: "正文",
    hrefTemplate: "/{{base_path}}/api/notifications",
    variableKeys: ["base_path"],
  }, { base_path: "test" });
  assert.deepEqual(renderedBasePathApi, {
    ok: false,
    issue: { message: "通知链接不能指向 API 路径", status: 400, field: "href" },
  });
});

test("render enforces title and body output limits", () => {
  const prepared = prepareNotificationDefinition(definition({
    titleTemplate: "{{title}}",
    bodyTemplate: "{{body}}",
    hrefTemplate: null,
  }));
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const title = renderNotificationDefinition(prepared.data, { title: "x".repeat(121), body: "ok" });
  assert.equal(title.ok, false);
  const body = renderNotificationDefinition(prepared.data, { title: "ok", body: "x".repeat(2_001) });
  assert.equal(body.ok, false);
});

test("reserved workflow variables cannot be declared", () => {
  const prepared = prepareNotificationDefinition(definition({ titleTemplate: "{{flowType}}" }));
  assert.equal(prepared.ok, false);
});
