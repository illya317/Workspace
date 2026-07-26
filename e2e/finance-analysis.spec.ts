import { expect, test } from "@playwright/test";
import { E2E_ADMIN_STORAGE_STATE } from "./support/auth";
import { recordReadyTransition } from "./support/readiness";

test.use({ storageState: E2E_ADMIN_STORAGE_STATE });
test.describe.configure({ retries: 0 });

test("管理会计六个视图使用真实三表、成本与控制数据", {
  tag: ["@critical", "@nightly", "@latency", "@finance-analysis-read"],
}, async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    const sourceUrl = message.location().url;
    const isExternalBrandAsset = sourceUrl.endsWith("/workspace/company/logo.png");
    if (message.type() === "error" && !isExternalBrandAsset) consoleErrors.push(message.text());
  });
  const managementResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith("/workspace/api/modules/finance/analysis/management"),
  );

  await recordReadyTransition({
    page,
    testInfo,
    name: "finance-analysis-initial",
    requiredUrlPaths: [
      "/workspace/finance/analysis",
      "/workspace/api/modules/finance/analysis/management",
    ],
    trigger: async () => {
      await page.goto("/workspace/finance/analysis");
      expect((await managementResponsePromise).status()).toBe(200);
    },
    waitUntilReady: async () => {
      await expect(page.getByRole("textbox", { name: "合并口径" })).toBeVisible();
      await expect(page.getByText("管理会计七领域覆盖", { exact: true })).toBeVisible();
    },
  });
  for (const label of ["管理总览", "资金与营运", "预算与预测", "盈利与成本", "投融资", "绩效与风险"]) {
    await expect(page.getByRole("tab", { name: label, exact: true })).toBeVisible();
  }

  await page.getByRole("tab", { name: "资金与营运", exact: true }).click();
  await expect(page.getByText("营运资金占用与来源", { exact: true })).toBeVisible();
  await expect(page.getByText("现金活动结构", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "预算与预测", exact: true }).click();
  await expect(page.getByText("实际费用同比控制", { exact: true })).toBeVisible();
  await expect(page.getByText("13周现金运行率情景", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "盈利与成本", exact: true }).click();
  await expect(page.getByText("成本费用结构与同比", { exact: true })).toBeVisible();
  await expect(page.getByText("发货产品 Top 10", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "投融资", exact: true }).click();
  await expect(page.getByText("投资与筹资活动", { exact: true })).toBeVisible();
  const balanceHeading = page.getByRole("heading", { name: "资本与往来余额信号" });
  const ledgerHeading = page.getByRole("heading", { name: "现金流水融资/投资渠道" });
  const [balanceBox, ledgerBox] = await Promise.all([balanceHeading.boundingBox(), ledgerHeading.boundingBox()]);
  expect(balanceBox).not.toBeNull();
  expect(ledgerBox).not.toBeNull();
  expect(ledgerBox!.y).toBeGreaterThan(balanceBox!.y + balanceBox!.height);
  for (const heading of [balanceHeading, ledgerHeading]) {
    const section = heading.locator("xpath=ancestor::*[.//table][1]");
    const horizontalScrollerCount = await section.evaluate((element) => [...element.querySelectorAll("*")].filter((node) => {
      const style = window.getComputedStyle(node);
      return (style.overflowX === "auto" || style.overflowX === "scroll") && node.scrollWidth > node.clientWidth + 1;
    }).length);
    expect(horizontalScrollerCount).toBe(0);
  }
  await page.getByRole("tab", { name: "绩效与风险", exact: true }).click();
  await expect(page.getByText("公司级绩效指标", { exact: true })).toBeVisible();
  await expect(page.getByText("风险发现与管理动作", { exact: true })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
