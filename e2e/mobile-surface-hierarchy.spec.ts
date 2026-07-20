import { expect, test } from "@playwright/test";
import { E2E_ADMIN_STORAGE_STATE } from "./support/auth";

test.use({ storageState: E2E_ADMIN_STORAGE_STATE });

test("移动端治理详情只保留一个主要 frame，嵌套职责使用连续编辑层级", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/modules/capitalSecurities/governance/organizations*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        organizations: [{
          id: 1,
          code: "AUDIT",
          name: "审计委员会",
          alias: null,
          hierarchyKind: "G",
          level: 1,
          parentId: null,
          parentName: null,
          managerPositionId: null,
          managerPositionName: null,
          managerEmployeeIds: [],
          managerEmployeeNames: [],
          managerName: null,
          directPositions: 0,
          totalPositions: 0,
          directHeadcount: 0,
          totalHeadcount: 0,
          children: [],
          descriptions: [{
            id: 11,
            code: "AUDIT",
            name: "审计委员会",
            sourceFile: "",
            codeRaw: null,
            details: {
              基本信息: { 部门名称: "审计委员会" },
              部门职责概要: [],
              部门职责描述: [{ title: "监督审计", items: ["监督内部审计工作"] }],
            },
          }],
        }],
        positions: [],
      },
    });
  });

  await page.goto("/workspace/capital-securities/governance");
  await page.getByRole("button", { name: /审计委员会/ }).click();

  const detail = page.locator('[data-mobile-split-pane="detail"]');
  await expect(detail).toBeVisible();
  await expect(detail.getByText("部门说明书", { exact: true })).toBeVisible();
  await expect(detail.locator('[data-surface-frame="primary"]')).toHaveCount(1);
  await expect.poll(() => detail.locator('[data-surface-frame="nested"]').count()).toBeGreaterThan(2);
  await expect(detail.locator('[data-form-repeatable-item="true"]')).toHaveCount(1);
  await expect(detail.getByRole("heading", { name: "部门职责描述", exact: true })).toHaveCount(1);

  const nestedFrames = await detail.locator('[data-surface-frame="nested"]').evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node);
    return {
      borderRight: style.borderRightWidth,
      borderBottom: style.borderBottomWidth,
      borderLeft: style.borderLeftWidth,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
    };
  }));
  expect(nestedFrames).toEqual(nestedFrames.map(() => ({
    borderRight: "0px",
    borderBottom: "0px",
    borderLeft: "0px",
    borderRadius: "0px",
    boxShadow: "none",
  })));

  const repeatableItem = detail.locator('[data-form-repeatable-item="true"]');
  await expect(repeatableItem).not.toHaveCSS("border-top-width", "1px");
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBe(viewport.clientWidth);
});
