import { expect, test } from "@playwright/test";
import { E2E_ADMIN_STORAGE_STATE } from "./support/auth";

const REPORTS_PATH = "/workspace/api/modules/work/tasks/reports";
const WEEK_ANCHOR = "2026-07-06";

test.use({ storageState: E2E_ADMIN_STORAGE_STATE });
test.describe.configure({ retries: 0 });

test("过期周报响应不会把已选择周期切回旧值", async ({ page }) => {
  const reportRequests: string[] = [];
  let resolveInitialPeriodStart: (value: string) => void = () => {};
  const initialPeriodStartPromise = new Promise<string>((resolve) => {
    resolveInitialPeriodStart = resolve;
  });

  await page.route(new RegExp(`${REPORTS_PATH}\\?`), async (route) => {
    const periodStart = new URL(route.request().url()).searchParams.get("periodStart") ?? "";
    const isInitialRequest = reportRequests.length === 0;
    reportRequests.push(periodStart);
    if (isInitialRequest) resolveInitialPeriodStart(periodStart);
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, isInitialRequest ? 600 : 20));
    await route.fulfill({ response });
  });

  await page.goto("/workspace/work/me/space");
  await page.getByText("工作汇报", { exact: true }).first().click();
  const currentWeekStart = await initialPeriodStartPromise;
  expect(currentWeekStart).not.toBe(WEEK_ANCHOR);
  const previousWeekStart = addDays(currentWeekStart, -7);

  const previousCard = page.getByRole("button").filter({ hasText: `${previousWeekStart.slice(5)} 周` });
  await previousCard.click();

  const previousPeriod = `${previousWeekStart} - ${addDays(previousWeekStart, 6)}`;
  const reportPeriodBadge = page.locator("span", { hasText: previousPeriod });
  await expect(reportPeriodBadge).toBeVisible();
  await page.waitForTimeout(900);

  expect(reportRequests).toEqual([currentWeekStart, previousWeekStart]);
  await expect(previousCard).toHaveClass(/bg-emerald-50/);
  await expect(reportPeriodBadge).toBeVisible();
});

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
