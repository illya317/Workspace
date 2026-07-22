import assert from "node:assert/strict";
import test from "node:test";
import { workflowActionHeaderCommands } from "./workflow-header-commands";

test("renders direct publication as a send command without changing its contract key", () => {
  const commands = workflowActionHeaderCommands([{
    key: "record.save",
    kind: "direct",
    label: "发布",
    onClick: () => undefined,
  }]);

  assert.equal(commands[0]?.key, "record.save");
  assert.equal(commands[0]?.icon, "send");
  assert.equal(commands[0]?.label, "发布");
});

test("keeps draft persistence visually distinct from publication", () => {
  const commands = workflowActionHeaderCommands([{
    key: "record.save",
    kind: "save",
    label: "保存草稿",
    onClick: () => undefined,
  }]);

  assert.equal(commands[0]?.key, "record.save");
  assert.equal(commands[0]?.icon, "save");
  assert.equal(commands[0]?.label, "保存草稿");
});
