import { expect, test } from "@playwright/test";
import { E2E_ADMIN_STORAGE_STATE } from "./support/auth";
import { recordReadyTransition } from "./support/readiness";

const TEST_TIMEOUT_MS = 90_000;
const SAVE_RESPONSE_TIMEOUT_MS = 15_000;
const RESTORE_TIMEOUT_MS = 15_000;
const ACCOUNT_RELOAD_SLOW_BUDGET_MS = 10_000;
test.use({ storageState: E2E_ADMIN_STORAGE_STATE });
test.describe.configure({ retries: 0 });

interface AccountProfile {
  username: string;
  alias: string | null;
  phone: string | null;
  employeeId: string | null;
}

function formattedPhone(phone: string | null) {
  const value = phone ?? "";
  if (value.length <= 3) return value;
  if (value.length <= 7) return `${value.slice(0, 3)} ${value.slice(3)}`;
  return `${value.slice(0, 3)} ${value.slice(3, 7)} ${value.slice(7)}`;
}

test("账号设置可以从页面保存、读回并在刷新后保持", {
  tag: ["@critical", "@nightly", "@latency", "@settings-account-save"],
}, async ({ page }, testInfo) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  const beforeResponse = await page.request.get("/workspace/api/settings/account/profile");
  expect(beforeResponse.ok()).toBeTruthy();
  const before = await beforeResponse.json() as AccountProfile;
  const changedPhone = before.phone === "13800000001" ? "13800000002" : "13800000001";

  const phoneInput = page.locator('input[inputmode="tel"]');
  await recordReadyTransition({
    page,
    testInfo,
    name: "settings-account-initial",
    requiredUrlPaths: [
      "/workspace/settings/account",
      "/workspace/api/settings/account/profile",
    ],
    trigger: () => page.goto("/workspace/settings/account"),
    waitUntilReady: async () => {
      await expect(page.getByRole("heading", { name: "账号信息", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "个性化桌面", exact: true })).toBeVisible();
      await expect(phoneInput).toHaveCount(1);
      await expect(phoneInput).toBeEnabled();
      await expect(phoneInput).toHaveValue(formattedPhone(before.phone));
    },
  });

  try {
    await phoneInput.fill(changedPhone);
    await expect(phoneInput).toHaveValue(formattedPhone(changedPhone));
    const [saveResponse] = await Promise.all([
      page.waitForResponse((response) => (
        response.request().method() === "PUT"
        && response.url().endsWith("/workspace/api/settings/account/profile")
      ), { timeout: SAVE_RESPONSE_TIMEOUT_MS }),
      phoneInput.press("Tab"),
    ]);
    expect(saveResponse.ok()).toBeTruthy();
    await expect(page.getByText("账号资料已更新", { exact: true })).toBeVisible();

    const readBackResponse = await page.request.get("/workspace/api/settings/account/profile");
    expect(readBackResponse.ok()).toBeTruthy();
    const readBack = await readBackResponse.json() as AccountProfile;
    expect(readBack.phone).toBe(changedPhone);

    await recordReadyTransition({
      page,
      testInfo,
      name: "settings-account-reload",
      slowBudgetMs: ACCOUNT_RELOAD_SLOW_BUDGET_MS,
      requiredUrlPaths: [
        "/workspace/settings/account",
        "/workspace/api/settings/account/profile",
      ],
      trigger: () => page.reload(),
      waitUntilReady: () => expect(page.locator('input[inputmode="tel"]'))
        .toHaveValue(formattedPhone(changedPhone)),
    });
  } finally {
    testInfo.setTimeout(testInfo.timeout + RESTORE_TIMEOUT_MS);
    const restoreResponse = await page.request.put("/workspace/api/settings/account/profile", {
      timeout: RESTORE_TIMEOUT_MS,
      data: {
        username: before.username,
        alias: before.alias,
        phone: before.phone,
      },
    });
    expect(restoreResponse.ok()).toBeTruthy();
  }
});
