import assert from "node:assert/strict";
import test from "node:test";
import type { ActionRuntime } from "../../workflow-action-runtime";
import { actionRuntimeCommands } from "./action-runtime-commands";

const directSaveRuntime = {
  actions: ["record.save"],
} as unknown as ActionRuntime;

test("keeps the record.save contract while allowing a distinct direct-action presentation", () => {
  const commands = actionRuntimeCommands(directSaveRuntime, {
    "record.save": {
      label: "发布",
      onClick: () => undefined,
      presentationKind: "direct",
    },
  });

  assert.equal(commands[0]?.key, "record.save");
  assert.equal(commands[0]?.kind, "direct");
  assert.equal(commands[0]?.label, "发布");
});

test("uses the canonical save presentation when no override is supplied", () => {
  const commands = actionRuntimeCommands(directSaveRuntime, {
    "record.save": { label: "保存草稿", onClick: () => undefined },
  });

  assert.equal(commands[0]?.key, "record.save");
  assert.equal(commands[0]?.kind, "save");
  assert.equal(commands[0]?.label, "保存草稿");
});
