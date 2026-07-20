import { expect, test } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { E2E_ADMIN_STORAGE_STATE } from "./support/auth";

const fixtureConfigDir = process.env.E2E_QC_FIXTURE_CONFIG_DIR?.trim();

if (fixtureConfigDir) {
  test.use({ storageState: E2E_ADMIN_STORAGE_STATE });
  test.describe.configure({ mode: "serial", retries: 0 });

  test.beforeAll(async () => {
    expect(path.resolve(process.env.WORKSPACE_CONFIG_DIR || "")).toBe(path.resolve(fixtureConfigDir));
    const snapshot = JSON.parse(await readFile(
      path.resolve("generated/production/qc/template-snapshots/products/allopurinol.json"),
      "utf8",
    ));
    const dataDir = path.join(fixtureConfigDir, "data");
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, "qc.json"), `${JSON.stringify({
      nextId: 2,
      batches: [{
        id: 1,
        batchNumber: "QC-MOBILE-001",
        productKey: snapshot.productKey,
        productName: snapshot.productName,
        templateSnapshot: {
          templateId: 1,
          templateVersion: 1,
          productKey: snapshot.productKey,
          productName: snapshot.productName,
          document: snapshot.document,
          fieldModel: snapshot.fieldModel,
          capturedAt: snapshot.generatedAt,
        },
        inspector: "",
        status: "draft",
        createdAt: "2026-07-19T00:00:00.000Z",
        updatedAt: "2026-07-19T00:00:00.000Z",
        fields: {},
      }],
    }, null, 2)}\n`, "utf8");
  });

  for (const width of [360, 375, 390]) {
    test(`${width}px：QC 以章节原生表单操作，不缩放纸面`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      const response = await page.goto("/workspace/production/qc/1/intermediate");
      expect(response?.status()).toBeLessThan(400);

      const mobileRecord = page.locator('[data-surface-visibility="mobile"]');
      const desktopPaper = page.locator('[data-surface-visibility="desktop"]');
      await expect(mobileRecord).toBeVisible();
      await expect(desktopPaper).toBeHidden();
      const directory = mobileRecord.locator('[data-mobile-section-view="directory"]');
      await expect(directory).toBeVisible();
      await expect(directory.getByRole("button", { name: /检验信息/ })).toBeVisible();
      await expect(directory.getByRole("button", { name: /文件/ })).toBeVisible();
      await directory.getByRole("button", { name: /文件/ }).click();

      const activeChapter = mobileRecord.locator('[data-mobile-section-view="detail"]');
      await expect(activeChapter.getByRole("heading", { name: "文件", exact: true })).toBeVisible();
      const firstChoice = activeChapter.locator('input[data-field-key="pre_check/file_1"][value="是"]');
      await expect(firstChoice).toBeAttached();
      const choiceButton = firstChoice.locator("xpath=..");
      const choiceButtonBox = await choiceButton.boundingBox();
      expect(choiceButtonBox?.height).toBeGreaterThanOrEqual(44);
      await firstChoice.check({ force: true });
      await expect(firstChoice).toBeChecked();
      const selectedBackground = await choiceButton.evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(selectedBackground).not.toBe("rgb(255, 255, 255)");
      await mobileRecord.getByRole("button", { name: "返回章节目录", exact: true }).click();
      await expect(directory).toBeVisible();

      const viewport = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(viewport.scrollWidth).toBe(viewport.clientWidth);
    });
  }

  test("桌面 QC 继续使用纸面记录", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/workspace/production/qc/1/intermediate");
    await expect(page.locator('[data-surface-visibility="mobile"]')).toBeHidden();
    await expect(page.locator('[data-surface-visibility="desktop"]')).toBeVisible();
  });
}
