import { test, expect } from "@playwright/test";

test.describe("鉴权与权限", () => {
  test("未登录访问 /hr 重定向到 /login", async ({ page }) => {
    await page.goto("/hr");
    await expect(page).toHaveURL(/.*login.*/);
  });

  test("未登录访问 /admin 重定向到 /login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/.*login.*/);
  });

  test("未登录访问 /finance 重定向到 /login", async ({ page }) => {
    await page.goto("/finance");
    await expect(page).toHaveURL(/.*login.*/);
  });

  test("登录页面可加载", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('text=账号')).toBeVisible();
    await expect(page.locator('text=密码')).toBeVisible();
  });
});
