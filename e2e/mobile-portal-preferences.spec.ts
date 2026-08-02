import { expect, test } from "@playwright/test";
import { E2E_ADMIN_STORAGE_STATE } from "./support/auth";

test.use({ storageState: E2E_ADMIN_STORAGE_STATE });
test.describe.configure({ mode: "serial", retries: 0 });

const PORTAL_SLOTS = [
  { key: "work", pinned: false },
  { key: "hr.roster", pinned: false },
  ...Array.from({ length: 10 }, () => ({ key: null, pinned: false })),
  { key: "hr.roster", pinned: true },
  { key: "docs.editor", pinned: true },
];

for (const width of [360, 375, 390]) {
  test(`${width}px：桌面提供十二个卡槽，入口按一级再二级选择`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await setPortalSlots(page);
    await page.goto("/workspace/settings/account");

    await expect(page.getByRole("button", { name: "切换到默认桌面", exact: true })).toBeVisible();
    const directory = page.locator('[data-mobile-section-view="directory"]');
    await directory.getByText("个性化桌面", { exact: true }).click();

    const cardsSection = page.getByRole("heading", { name: "自选桌面卡片", exact: true })
      .locator("xpath=ancestor::section[1]");
    const shortcutSection = page.getByRole("heading", { name: "移动端底栏", exact: true })
      .locator("xpath=ancestor::section[1]");
    await expect(cardsSection.getByRole("button")).toHaveCount(12);
    await expect(shortcutSection.getByRole("button")).toHaveCount(2);
    await expect(cardsSection.getByText("快捷", { exact: true })).toHaveCount(0);
    await expect(shortcutSection.getByText("快捷", { exact: true })).toHaveCount(2);
    for (const fixedLabel of ["桌面", "消息", "我的"]) {
      await expect(shortcutSection.getByText(fixedLabel, { exact: true })).toBeVisible();
    }
    await expect(cardsSection.getByRole("heading", { name: "人事基础资料", exact: true })).toBeVisible();
    await expect(shortcutSection.getByRole("heading", { name: "模板编辑器", exact: true })).toBeVisible();
    await expectModuleTitlesFit(cardsSection);
    await expectModuleTitlesFit(shortcutSection);

    await cardsSection.getByRole("button").nth(2).click();
    await expect(page.getByRole("heading", { name: "选择桌面卡片 3", exact: true })).toBeVisible();
    await expect(page.getByText("工作空间", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: /工作管理 一级/ }).click();

    await expect(page.getByRole("heading", { name: "选择工作管理入口", exact: true })).toBeVisible();
    const personalizationDetail = page.locator('[data-mobile-section-view="detail"]');
    await expect(personalizationDetail.getByText("模块首页", { exact: true })).toHaveCount(0);
    await expect(personalizationDetail.getByText("项目管理", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "返回一级入口", exact: true }).click();
    await expect(page.getByRole("heading", { name: "选择桌面卡片 3", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "返回个性化桌面", exact: true }).click();
    await expect(page.getByRole("heading", { name: "自选桌面卡片", exact: true })).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });

  test(`${width}px：自选只显示所选卡片，默认桌面只显示一级入口`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await setPortalSlots(page);
    const preferencesLoaded = page.waitForResponse((response) => (
      response.request().method() === "GET"
      && response.url().endsWith("/workspace/api/settings/account/portal-slots")
    ));
    await page.goto("/workspace/portal");
    await preferencesLoaded;

    const bottomNavigation = page.getByRole("navigation", { name: "移动端主导航", exact: true });
    await expect(bottomNavigation.getByRole("button")).toHaveCount(5);
    await expect(page.locator("main a")).toHaveCount(2);
    await expect(page.locator("main").getByText("快捷", { exact: true })).toHaveCount(0);
    await expectGridColumns(page, 4);

    await page.getByRole("button", { name: "切换到默认桌面", exact: true }).click();
    await expect(page).toHaveURL(/\/workspace\/portal\?desktop=default$/);
    const defaultCards = page.locator("main a");
    const defaultCount = await defaultCards.count();
    expect(defaultCount).toBeGreaterThan(0);
    expect(defaultCount).toBeLessThanOrEqual(12);
    const defaultDepths = await defaultCards.evaluateAll((links) => links.map((link) => (
      new URL((link as HTMLAnchorElement).href).pathname
        .replace(/^\/workspace\/?/, "")
        .split("/")
        .filter(Boolean)
        .length
    )));
    expect(defaultDepths.every((depth) => depth === 1)).toBeTruthy();

    await expectNoHorizontalOverflow(page);
  });
}

test("桌面端使用三列并同样只渲染所选卡片", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setPortalSlots(page);
  const preferencesLoaded = page.waitForResponse((response) => response.url().endsWith("/workspace/api/settings/account/portal-slots"));
  await page.goto("/workspace/portal");
  await preferencesLoaded;

  await expect(page.locator("main a")).toHaveCount(2);
  await expect(page.locator("main").getByText("快捷", { exact: true })).toHaveCount(0);
  await expectGridColumns(page, 3);
});

async function setPortalSlots(page: import("@playwright/test").Page) {
  const response = await page.request.put("/workspace/api/settings/account/portal-slots", {
    data: { slots: PORTAL_SLOTS },
  });
  expect(response.ok()).toBeTruthy();
}

async function expectModuleTitlesFit(section: import("@playwright/test").Locator) {
  const clippedTitles = await section.locator("h3").evaluateAll((titles) => titles
    .filter((title) => title.scrollHeight > title.clientHeight + 1 || title.scrollWidth > title.clientWidth + 1)
    .map((title) => title.textContent?.trim() ?? ""));
  expect(clippedTitles).toEqual([]);
}

async function expectGridColumns(page: import("@playwright/test").Page, count: number) {
  const grid = page.locator("main a").first().locator("xpath=..");
  const columns = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(count);
}

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBe(viewport.clientWidth);
}
