import assert from "node:assert/strict";
import test from "node:test";

import { buildHRToolbarItems } from "./hr-toolbar-items";

test("history remains available independently of row edit mode", () => {
  const items = buildHRToolbarItems({
    history: { onClick: () => undefined },
    editGroup: {
      editMode: false,
      canEdit: false,
      onStartEdit: () => undefined,
      onSave: () => undefined,
      onCancel: () => undefined,
      onDownload: () => undefined,
    },
  });

  const actions = items.find((item) => item.kind === "action-group");
  const editGroup = items.find((item) => item.kind === "edit-group");
  assert.equal(actions?.kind, "action-group");
  assert.deepEqual(actions?.kind === "action-group" ? actions.actions.map((action) => action.kind) : [], ["history"]);
  assert.equal(editGroup?.kind === "edit-group" ? editGroup.canEdit : true, false);
});
