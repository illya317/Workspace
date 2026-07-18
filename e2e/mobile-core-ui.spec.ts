import { expect, test } from "@playwright/test";
import { E2E_ADMIN_STORAGE_STATE } from "./support/auth";

const REPORTS_PATH = "/workspace/api/modules/work/tasks/reports";

test.use({
  storageState: E2E_ADMIN_STORAGE_STATE,
});
test.describe.configure({ mode: "serial", retries: 0 });

for (const width of [360, 375, 390]) {
  test(`${width}px：工作视图可完整切换，工具栏纯图标，周报矩阵转为可操作卡片`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockWorkReports(page);

    await page.goto("/workspace/work/me");

    await expectIconOnlyActions(page, ["新增", "显示工作计划", "筛选", "更多"]);

    const selector = page.getByRole("button", { name: /当前栏目.*切换/ });
    await expect(selector).toContainText("工作计划");
    await selector.click();

    await expect(page.getByRole("heading", { name: "工作视图", exact: true })).toBeVisible();
    for (const name of ["工作计划", "工作汇报", "指标计分卡", "目标考核", "甘特图"]) {
      await expect(page.getByRole("tab", { name, exact: true })).toBeVisible();
    }

    await page.getByRole("tab", { name: "周报", exact: true }).click();
    await expect(page.getByRole("heading", { name: "周度工作汇报", exact: true })).toBeVisible();

    const reportCard = page.locator("article").filter({ hasText: "提高移动端信息可读性" });
    await expect(reportCard).toBeVisible();
    await expect(reportCard.getByText("本周完成情况", { exact: true })).toBeVisible();
    await expect(reportCard.getByText("下周计划", { exact: true })).toBeVisible();
    await expect(reportCard.getByText("关键结果", { exact: true })).toBeVisible();
    await expect(reportCard.getByText("修复栏目文字裁切", { exact: true })).toBeVisible();
    await expect(reportCard.getByText("验证 360–390px 触控流程", { exact: true })).toBeVisible();
    await expect(page.locator("table")).toBeHidden();
    const saveAction = page.getByRole("button", { name: "保存快照", exact: true });
    await expect(saveAction).toBeEnabled();
    await saveAction.click();
    await expect(page.getByText("工作汇报快照已保存", { exact: true })).toBeVisible();
    await expect(saveAction).toBeDisabled();

    const viewport = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(viewport.scrollWidth).toBe(viewport.clientWidth);
  });
}

test("桌面工具栏操作保持纯图标", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockWorkReports(page);
  await page.goto("/workspace/work/me");

  await expectIconOnlyActions(page, ["新增", "隐藏工作计划", "页面助手"]);
});

async function mockWorkReports(page: import("@playwright/test").Page) {
  await page.route(new RegExp(`${REPORTS_PATH}(?:\\?|$)`), async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        json: {
          executionMode: "direct",
          report: {
            period: { periodType: "weekly", periodStart: "2026-07-13", periodEnd: "2026-07-19" },
            reportStage: "final",
            canEdit: true,
            actionRuntime: editableReportRuntime,
            report: {
              id: 9301,
              targetType: "employee",
              targetId: 1,
              periodType: "weekly",
              reportStage: "final",
              periodStart: "2026-07-13",
              periodEnd: "2026-07-19",
              submittedBy: 1,
              submitterName: "移动端测试用户",
              submittedAt: "2026-07-18T14:00:00.000Z",
              updatedAt: "2026-07-18T14:00:00.000Z",
              items: reportItems,
              groups: [],
            },
            items: reportItems,
            groups: [],
          },
        },
      });
      return;
    }
    const periodStart = new URL(route.request().url()).searchParams.get("periodStart") ?? "2026-07-13";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        period: { periodType: "weekly", periodStart, periodEnd: addDays(periodStart, 6) },
        reportStage: "final",
        canEdit: true,
        actionRuntime: editableReportRuntime,
        report: null,
        items: reportItems,
        groups: [],
      },
    });
  });
}

async function expectIconOnlyActions(page: import("@playwright/test").Page, names: string[]) {
  for (const name of names) {
    const action = page.getByRole("button", { name, exact: true });
    await expect(action).toBeVisible();
    await expect(action).toHaveText("");
  }
}

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

const allowed = { allowed: true, reason: null } as const;
const blocked = { allowed: false, reason: "workflow_disabled" } as const;
const editableReportRuntime = {
  businessActionKey: "work.tasks.report.save",
  availability: "available",
  executionMode: "direct",
  unavailableReason: null,
  persistenceMode: "active",
  workflowRole: "none",
  editability: "editable",
  requestId: null,
  status: null,
  capabilities: {
    form: { cancel: allowed },
    record: { save: allowed },
    workflowRequest: {
      submit: blocked,
      withdraw: blocked,
      revise: blocked,
      resubmit: blocked,
      cancel: blocked,
      approve: blocked,
      reject: blocked,
      reviewUpdate: blocked,
    },
  },
  actions: ["record.save", "form.cancel"],
};

const baseReportItem = {
  id: null,
  workPlanId: 9001,
  workItemId: 9101,
  workPlanTitle: "移动端体验升级",
  workPlanKind: "okr" as const,
  workItemType: "task" as const,
  parentWorkItemId: 9002,
  parentTitle: "关键操作一次可达",
  objectiveTitleSnapshot: "提高移动端信息可读性",
  keyResultTitleSnapshot: "关键操作一次可达",
  workItemStatusSnapshot: "active",
  snapshotPlannedStartDate: "2026-07-13",
  snapshotPlannedEndDate: "2026-07-19",
  snapshotActualEndDate: null,
  snapshotCompletedAt: null,
  previousPlanSnapshot: "",
  currentKeyResult: "",
  nextObjective: "",
  note: "",
  selfScore: null,
  performanceScore: null,
  source: "work" as const,
};

const reportItems = [
  {
    ...baseReportItem,
    title: "修复栏目文字裁切",
    reportItemKind: "current" as const,
    sortOrder: 0,
  },
  {
    ...baseReportItem,
    id: null,
    workItemId: 9102,
    title: "验证 360–390px 触控流程",
    reportItemKind: "next" as const,
    snapshotPlannedStartDate: "2026-07-20",
    snapshotPlannedEndDate: "2026-07-26",
    sortOrder: 1,
  },
];
