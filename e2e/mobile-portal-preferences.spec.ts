import { expect, test } from "@playwright/test";
import { E2E_ADMIN_STORAGE_STATE } from "./support/auth";

test.use({ storageState: E2E_ADMIN_STORAGE_STATE });
test.describe.configure({ mode: "serial", retries: 0 });

for (const width of [360, 375, 390]) {
  test(`${width}px：个性化桌面保留九张排序卡片，底栏固定三项加两个快捷方式`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/workspace/settings/account");

    await expect(page.getByRole("button", { name: "切换到默认桌面", exact: true })).toBeVisible();
    const directory = page.locator('[data-mobile-section-view="directory"]');
    await expect(directory).toBeVisible();
    await directory.getByText("个性化桌面", { exact: true }).click();

    const prioritySection = page.getByRole("heading", { name: "桌面卡片顺序", exact: true })
      .locator("xpath=ancestor::section[1]");
    const shortcutSection = page.getByRole("heading", { name: "移动端底栏", exact: true })
      .locator("xpath=ancestor::section[1]");
    await expect(prioritySection.getByRole("button")).toHaveCount(9);
    await expect(shortcutSection.getByRole("button")).toHaveCount(2);
    for (const fixedLabel of ["桌面", "消息", "我的"]) {
      await expect(shortcutSection.getByText(fixedLabel, { exact: true })).toBeVisible();
    }

    await prioritySection.getByRole("button").first().click();
    await expect(page.getByRole("heading", { name: "选择桌面卡片 1", exact: true })).toBeVisible();
    await expect(page.getByText("一级入口", { exact: true }).first()).toBeVisible();
    const backAction = page.getByRole("button", { name: "返回个性化桌面", exact: true });
    await expect(backAction).toBeVisible();
    await expect(backAction).toHaveText("");
    await backAction.click();
    await expect(page.getByRole("heading", { name: "桌面卡片顺序", exact: true })).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });

  test(`${width}px：个性化与默认桌面都完整展示全部可访问入口`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const preferencesLoaded = page.waitForResponse((response) => (
      response.request().method() === "GET"
      && response.url().endsWith("/workspace/api/settings/account/portal-slots")
    ));
    await page.goto("/workspace/portal");
    await preferencesLoaded;

    await expect(page.locator("main h1").first()).toBeVisible();
    const bottomNavigation = page.getByRole("navigation", { name: "移动端主导航", exact: true });
    await expect(bottomNavigation.getByRole("button")).toHaveCount(5);
    for (const fixedLabel of ["桌面", "消息", "我的"]) {
      await expect(bottomNavigation.getByText(fixedLabel, { exact: true })).toBeVisible();
    }
    const personalizedCount = await page.locator("main a").count();
    expect(personalizedCount).toBeGreaterThan(9);

    await page.getByRole("button", { name: "切换到默认桌面", exact: true }).click();
    await expect(page).toHaveURL(/\/workspace\/portal\?desktop=default$/);
    await expect(page.getByRole("button", { name: "切换到我的桌面", exact: true })).toBeVisible();
    await expect(page.locator("main a")).toHaveCount(personalizedCount);

    await expectNoHorizontalOverflow(page);
  });
}

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBe(viewport.clientWidth);
}
