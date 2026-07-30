import assert from "node:assert/strict";
import test from "node:test";

import {
  notificationChannelHealthView,
  notificationDefinitionLifecycleActionView,
  notificationDeliveryCountLabel,
  notificationPublicationStatusView,
} from "./notification-publishing-workbench-model";

test("notificationPublicationStatusView exposes Chinese delivery states and risk tones", () => {
  assert.deepEqual(notificationPublicationStatusView("committed"), { label: "已提交", tone: "slate" });
  assert.deepEqual(notificationPublicationStatusView("processing"), { label: "投递中", tone: "blue" });
  assert.deepEqual(notificationPublicationStatusView("partial"), { label: "部分成功", tone: "amber" });
  assert.deepEqual(notificationPublicationStatusView("failed"), { label: "投递失败", tone: "red" });
  assert.deepEqual(notificationPublicationStatusView("delivered"), { label: "已送达", tone: "green" });
});

test("notificationDefinitionLifecycleActionView keeps every immutable transition explicit", () => {
  assert.deepEqual(notificationDefinitionLifecycleActionView("created"), { label: "已创建", tone: "blue" });
  assert.deepEqual(notificationDefinitionLifecycleActionView("saved"), { label: "草稿已保存", tone: "slate" });
  assert.deepEqual(notificationDefinitionLifecycleActionView("published"), { label: "已发布", tone: "green" });
  assert.deepEqual(notificationDefinitionLifecycleActionView("archived"), { label: "已归档", tone: "slate" });
});

test("notificationChannelHealthView prioritizes disabled endpoints and maps worker health", () => {
  assert.deepEqual(notificationChannelHealthView({ status: "disabled", healthStatus: "healthy" }), {
    label: "已停用",
    tone: "slate",
  });
  assert.deepEqual(notificationChannelHealthView({ status: "active", healthStatus: "healthy" }), {
    label: "运行正常",
    tone: "green",
  });
  assert.deepEqual(notificationChannelHealthView({ status: "active", healthStatus: "degraded" }), {
    label: "运行降级",
    tone: "amber",
  });
  assert.deepEqual(notificationChannelHealthView({ status: "active", healthStatus: "failing" }), {
    label: "投递异常",
    tone: "red",
  });
  assert.deepEqual(notificationChannelHealthView({ status: "active", healthStatus: "disconnected" }), {
    label: "连接断开",
    tone: "red",
  });
  assert.deepEqual(notificationChannelHealthView({ status: "active", healthStatus: "unknown" }), {
    label: "状态未知",
    tone: "slate",
  });
});

test("notificationDeliveryCountLabel keeps delivered, pending and failed visible", () => {
  assert.equal(notificationDeliveryCountLabel({
    deliveredDeliveryCount: 8,
    pendingDeliveryCount: 3,
    failedDeliveryCount: 1,
  }), "已送达 8 · 待处理 3 · 失败 1");
});
