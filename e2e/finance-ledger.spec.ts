import { expect, test } from "@playwright/test";
import { E2E_ADMIN_STORAGE_STATE } from "./support/auth";
import { recordReadyTransition } from "./support/readiness";

test.use({ storageState: E2E_ADMIN_STORAGE_STATE });
test.describe.configure({ retries: 0 });

test("总账科目首屏使用合法的全部范围", {
  tag: ["@critical", "@nightly", "@latency", "@finance-ledger-read"],
}, async ({ page }, testInfo) => {
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

  await recordReadyTransition({
    page,
    testInfo,
    name: "finance-ledger-initial",
    requiredUrlPaths: [
      "/workspace/finance/ledger",
      "/workspace/api/modules/finance/ledger/accounts",
    ],
    trigger: async () => {
      await page.goto("/workspace/finance/ledger");
      const accountsResponse = await accountsResponsePromise;
      expect(accountsResponse.status()).toBe(200);
      expect(new URL(accountsResponse.url()).searchParams.get("scope")).toBe("all");
    },
    waitUntilReady: () => expect(page.getByText("总账基础", { exact: true })).toBeVisible(),
  });
  expect(reclassRuleRequests).toEqual([]);
  await expect(page.getByText("加载失败", { exact: true })).toHaveCount(0);
});
