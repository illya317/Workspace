import { expect, test } from "@playwright/test";

test("总账科目首屏使用合法的全部范围", async ({ page }) => {
  const loginResponse = await page.request.get("/workspace/api/auth/dev-login-bypass?userId=2");
  expect(loginResponse.ok()).toBeTruthy();

  const reclassRuleRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith("/workspace/api/modules/finance/ledger/reclass-rules")) {
      reclassRuleRequests.push(url.toString());
    }
  });

  const accountsResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith("/workspace/api/modules/finance/ledger/accounts"),
  );

  await page.goto("/workspace/finance/ledger");

  const accountsResponse = await accountsResponsePromise;
  expect(accountsResponse.status()).toBe(200);
  expect(new URL(accountsResponse.url()).searchParams.get("scope")).toBe("all");
  await expect(page.getByText("总账基础", { exact: true })).toBeVisible();
  expect(reclassRuleRequests).toEqual([]);
  await expect(page.getByText("加载失败", { exact: true })).toHaveCount(0);
});
