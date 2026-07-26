import assert from "node:assert/strict";
import test, { mock } from "node:test";

type MockModule = (specifier: string, options: { namedExports: Record<string, unknown> }) => void;
const mockModule = (mock as unknown as { module: MockModule }).module.bind(mock);

mockModule("../../packages/core/ui/internal/action/ActionGlyphs", {
  namedExports: { ACTION_GLYPH_ACTION_BY_KEY: { unarchive: { icon: "restore" } } },
});
mockModule("../../packages/core/ui/internal/form/form-surface-actions", {
  namedExports: { orderFormSurfaceActions: (actions: readonly unknown[]) => [...actions] },
});

let findFormSurfaceActionViolationsInSource: typeof import("./form-surface-actions")["findFormSurfaceActionViolationsInSource"];

test.before(async () => {
  ({ findFormSurfaceActionViolationsInSource } = await import("./form-surface-actions"));
});

test("rejects lifecycle actions in a parent section header for a direct root form", () => {
  const violations = findFormSurfaceActionViolationsInSource("parent-actions.tsx", `
    createPanelSection("info", {
      title: "组织信息",
      actions: [{ key: "save", icon: "save", onClick: save }],
      sections: [{
        key: "fields",
        body: { kind: "form", form: { kind: "fields", content: { items: [] } } },
      }],
    });
  `);

  assert.match(violations[0]?.reason ?? "", /parent header/);
});

test("rejects a titled parent section separated from root form actions", () => {
  const violations = findFormSurfaceActionViolationsInSource("split-header.tsx", `
    const formActions = [{ key: "save", action: "save", onClick: save }];
    createPanelSection("info", {
      title: "组织信息",
      sections: [{
        key: "fields",
        body: { kind: "form", form: { kind: "fields", actions: formActions, content: { items: [] } } },
      }],
    });
  `);

  assert.match(violations[0]?.reason ?? "", /split a root form/);
});

test("allows an untitled parent whose root form owns its title and actions", () => {
  const violations = findFormSurfaceActionViolationsInSource("owned-header.tsx", `
    createPanelSection("info", {
      sections: [createFieldsSection("fields", [], {
        header: { title: "组织信息" },
        actions: [{ key: "save", action: "save", onClick: save }],
      })],
    });
  `);

  assert.deepEqual(violations, []);
});

test("allows a parent title for a later inline form or a panel with its own actions", () => {
  const violations = findFormSurfaceActionViolationsInSource("panel-actions.tsx", `
    createPanelSection("participants", {
      title: "参会人",
      sections: [
        createListSection("items", { items: [] }),
        createInlineFieldsSection("add", [], { actions: [{ key: "add", action: "add" }] }),
      ],
    });
    createPanelSection("approval", {
      title: "审批",
      actions: [{ key: "back", icon: "back" }],
      sections: [createFieldsSection("fields", [], { actions: [{ key: "approve", action: "approve" }] })],
    });
  `);

  assert.deepEqual(violations, []);
});
