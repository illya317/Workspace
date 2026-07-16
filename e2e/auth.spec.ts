import { expect, test } from "@playwright/test";
import { recordReadyTransition } from "./support/readiness";

test.describe("鉴权与权限", {
  tag: ["@critical", "@nightly", "@auth-access"],
}, () => {
  test.describe.configure({ retries: 0 });
  test("未登录访问人事入口重定向到无 next 参数的登录页", async ({ page }) => {
    await page.goto("/workspace/hr");
    await expect(page).toHaveURL((url) => url.pathname === "/workspace/login" && url.search === "");
  });

  test("未登录访问管理中心重定向到无 next 参数的登录页", async ({ page }) => {
    await page.goto("/workspace/settings/admin");
    await expect(page).toHaveURL((url) => url.pathname === "/workspace/login" && url.search === "");
  });

  test("未登录访问财务入口重定向到无 next 参数的登录页", async ({ page }) => {
    await page.goto("/workspace/finance");
    await expect(page).toHaveURL((url) => url.pathname === "/workspace/login" && url.search === "");
  });

  test("登录页面可加载", { tag: "@latency" }, async ({ page }, testInfo) => {
    await recordReadyTransition({
      page,
      testInfo,
      name: "login-page",
      requiredUrlPaths: ["/workspace/login"],
      trigger: () => page.goto("/workspace/login"),
      waitUntilReady: async () => {
        await expect(page.getByRole("textbox", { name: "请输入账号" })).toBeVisible();
        await expect(page.getByRole("textbox", { name: "请输入密码" })).toBeVisible();
      },
    });
  });
});
