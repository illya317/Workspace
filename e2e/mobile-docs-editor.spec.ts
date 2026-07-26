import { expect, test } from "@playwright/test";
import { E2E_ADMIN_STORAGE_STATE } from "./support/auth";

test.use({ storageState: E2E_ADMIN_STORAGE_STATE });

test("模板编辑器竖屏明确要求横屏，横屏按四组工具浏览纸面", async ({ page }) => {
  await mockDocsEditor(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/workspace/docs/editor");

  const listPane = page.locator('[data-mobile-split-pane="list"]');
  await expect(listPane).toBeVisible();

  const landscapePrompt = page.locator('[data-document-editor-mobile-state="portrait"]:visible');
  await expect(landscapePrompt.getByRole("heading", { name: "请横屏编辑", exact: true })).toBeVisible();
  await expect(landscapePrompt.getByText("模板纸面和编辑工具仅在移动端横屏模式下开放。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "加粗", exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(landscapePrompt).toBeHidden();
  const landscapeEditor = page.locator('[data-document-editor-mobile-state="landscape"]:visible');
  await expect(landscapeEditor).toBeVisible();
  await expect(landscapeEditor.getByRole("tab", { name: "文字", exact: true })).toHaveAttribute("aria-selected", "true");
  for (const tab of ["文字", "段落", "插入", "表格"]) {
    await expect(landscapeEditor.getByRole("tab", { name: tab, exact: true })).toBeVisible();
  }
  await expect(landscapeEditor.getByRole("button", { name: "加粗", exact: true })).toBeVisible();
  await expect(landscapeEditor.getByRole("button", { name: "插入表格", exact: true })).toHaveCount(0);

  await landscapeEditor.getByRole("tab", { name: "表格", exact: true }).click();
  await expect(landscapeEditor.getByRole("button", { name: "插入表格", exact: true })).toBeVisible();
  await expect(landscapeEditor.getByRole("button", { name: "加粗", exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

async function mockDocsEditor(page: import("@playwright/test").Page) {
  const actionPermissions = {
    canRead: true,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    canArchive: false,
    canSubmit: false,
    canApprove: false,
    canPublish: false,
    canExport: false,
    canManagePermissions: false,
  };
  const template = {
    id: "mobile-landscape-template",
    title: "移动端横屏模板",
    type: "document",
    status: "draft",
    spaceId: "personal-2",
    version: 1,
    updatedAt: "2026-07-18T12:00:00.000Z",
    stageCount: 1,
    fieldCount: 0,
    formulaCount: 0,
    tableCount: 0,
    actionPermissions,
  };
  await page.route(/\/workspace\/api\/modules\/docs\/editor(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    json: {
      spaces: [{
        id: "personal-2",
        kind: "personal",
        targetType: "personal",
        targetId: 2,
        title: "个人模板",
        actionPermissions,
        actionRuntimes: { create: null, save: null, publish: null },
      }],
      templates: [template],
    },
  }));
  await page.route("**/workspace/api/modules/docs/editor/templates/mobile-landscape-template", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    json: {
      ...template,
      document: {
        schemaVersion: 1,
        kind: "editor-document",
        id: "mobile-landscape-document",
        title: "移动端横屏模板",
        blocks: [
          { id: "heading", type: "heading", level: 1, text: "移动端横屏模板" },
          { id: "paragraph", type: "paragraph", parts: [{ type: "text", text: "横屏下浏览和编辑纸面内容。" }] },
        ],
      },
      fieldModel: { schemaVersion: 1, fields: {}, formulas: {} },
    },
  }));
}

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBe(viewport.clientWidth);
}
