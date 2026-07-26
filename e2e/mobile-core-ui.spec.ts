import { expect, test } from "@playwright/test";
import { E2E_ADMIN_STORAGE_STATE } from "./support/auth";

const REPORTS_PATH = "/workspace/api/modules/work/tasks/reports";

test.use({
  storageState: E2E_ADMIN_STORAGE_STATE,
});
test.describe.configure({ mode: "serial", retries: 0 });

for (const width of [360, 375, 390]) {
  test(`${width}px：工作视图可完整切换，工具栏纯图标，周报使用移动端记录列表`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockWorkReports(page);

    await page.goto("/workspace/work/me");

    await expect(page.getByAltText("Logo")).toBeHidden();
    const mobileBack = page.locator('nav button[aria-label="返回"]:visible');
    await expect(mobileBack).toBeVisible();
    const mobileBackBox = await mobileBack.boundingBox();
    expect(mobileBackBox?.x).toBeLessThanOrEqual(16);
    expect(mobileBackBox?.width).toBeGreaterThanOrEqual(44);

    await expectIconOnlyActions(page, ["新增", "筛选", "更多"]);
    const commandDock = page.locator('[data-mobile-toolbar-command-dock="true"]');
    const commandDockMetrics = await commandDock.evaluate((node) => ({
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
      actions: node.querySelectorAll("button").length,
    }));
    expect(commandDockMetrics.scrollWidth).toBe(commandDockMetrics.clientWidth);
    expect(commandDockMetrics.actions).toBeLessThanOrEqual(5);

    await page.getByRole("button", { name: "更多", exact: true }).click();
    const toolbarSheet = page.locator('[data-mobile-toolbar-sheet="true"]');
    await expect(toolbarSheet).toBeVisible();
    await expect(toolbarSheet.getByRole("heading", { name: "更多操作", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    const sheetMetrics = await toolbarSheet.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        bottom: Math.round(rect.bottom),
        height: Math.round(rect.height),
        parentIsBody: node.parentElement === document.body,
        viewportHeight: window.innerHeight,
      };
    });
    expect(sheetMetrics.parentIsBody).toBe(true);
    expect(sheetMetrics.height).toBe(sheetMetrics.viewportHeight);
    expect(sheetMetrics.bottom).toBe(sheetMetrics.viewportHeight);
    const actionRows = toolbarSheet.locator('[data-mobile-toolbar-action-row="true"]');
    const settingsControl = toolbarSheet.locator('[data-mobile-toolbar-control="page-size"]');
    await expect(settingsControl).toBeVisible();
    await expect(settingsControl.getByRole("textbox")).toHaveCount(0);
    await expect(settingsControl.getByRole("radio", { name: "10条/页", exact: true })).toBeVisible();
    await expect(settingsControl.getByRole("radio", { name: "20条/页", exact: true })).toBeVisible();
    await expect(settingsControl.getByRole("radio", { name: "50条/页", exact: true })).toBeVisible();
    const actionLabels = await actionRows.allInnerTexts();
    expect(actionLabels.every((label) => label.trim().length > 0)).toBe(true);
    const sheetScroll = toolbarSheet.locator('[data-mobile-toolbar-sheet-scroll="true"]');
    await sheetScroll.evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await expect(toolbarSheet.getByRole("button", { name: "关闭更多操作", exact: true })).toBeVisible();
    await toolbarSheet.getByRole("button", { name: "关闭更多操作", exact: true }).click();
    await expect(toolbarSheet).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");

    await page.getByRole("button", { name: "筛选", exact: true }).click();
    const filterSheet = page.locator('[data-mobile-toolbar-sheet="true"]');
    const filterHeading = filterSheet.getByRole("heading", { name: "筛选条件", exact: true });
    const firstFilterControl = filterSheet.locator('[data-mobile-toolbar-control]').first();
    await expect(filterHeading).toBeVisible();
    await expect(firstFilterControl).toBeVisible();
    const filterGap = await filterSheet.evaluate((sheet) => {
      const heading = sheet.querySelector("h2");
      const control = sheet.querySelector<HTMLElement>('[data-mobile-toolbar-control]');
      if (!heading || !control) return Number.POSITIVE_INFINITY;
      const headingRect = heading.getBoundingClientRect();
      const controlRect = control.getBoundingClientRect();
      return Math.round(controlRect.top - headingRect.bottom);
    });
    expect(filterGap).toBeLessThanOrEqual(32);
    await filterSheet.getByRole("button", { name: "关闭筛选条件", exact: true }).click();

    const selector = page.getByRole("button", { name: /当前栏目.*切换/ });
    await expect(selector).toContainText("计划");
    await selector.click();

    await expect(page.getByRole("heading", { name: "工作视图", exact: true })).toBeVisible();
    for (const name of ["计划", "工作汇报", "指标计分卡", "目标考核", "甘特图"]) {
      await expect(page.getByRole("tab", { name, exact: true })).toBeVisible();
    }

    await page.getByRole("tab", { name: "周报", exact: true }).click();
    await page.getByRole("button", { name: "07-13 周 2026-07-13 - 2026-07-19", exact: true }).click();
    await expect(page.getByRole("heading", { name: "周度工作汇报", exact: true })).toBeVisible();

    await expect(page.locator('[data-mobile-experience="landscape"]')).toHaveCount(0);
    await expect(page.locator('[data-mobile-table-presentation="list"]:visible').filter({ hasText: "提高移动端信息可读性" })).toBeVisible();
    await expect(page.getByText("提高移动端信息可读性", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("本周完成情况", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("修复栏目文字裁切", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("下周计划", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("验证 360–390px 触控流程", { exact: true }).first()).toBeVisible();
    await page.getByText("更多信息", { exact: true }).first().click();
    await expect(page.getByText("关键结果", { exact: true }).first()).toBeVisible();
    await expect(page.locator("table:visible")).toHaveCount(0);
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

  test(`${width}px：开发治理页明确提示手机端不提供入口`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/workspace/settings/ui");

    await expect(page.getByRole("heading", { name: "手机端暂不提供UI 组件库", exact: true })).toBeVisible();
    await expect(page.getByText("组件注册表是开发与治理工具，手机端不提供入口。", { exact: true })).toBeVisible();
    await expect(page.locator('[data-mobile-experience="unavailable"]').getByRole("button", { name: "返回", exact: true })).toBeVisible();
    await expect(page.locator('[data-mobile-split-pane]:visible')).toHaveCount(0);

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

test("移动端更多操作把即时动作与显示设置分组呈现", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await page.goto("/workspace/administration/contracts");

  await page.getByRole("button", { name: "更多", exact: true }).click();
  const toolbarSheet = page.locator('[data-mobile-toolbar-sheet="true"]');
  await expect(toolbarSheet.getByRole("heading", { name: "更多操作", exact: true })).toBeVisible();
  const actionRows = toolbarSheet.locator('[data-mobile-toolbar-action-row="true"]');
  await expect(actionRows.first()).toBeVisible();
  expect((await actionRows.allInnerTexts()).every((label) => label.trim().length > 0)).toBe(true);
  await expect(toolbarSheet.locator('[data-mobile-toolbar-control="column-toggle"]')).toBeVisible();
  await expect(toolbarSheet.locator('[data-mobile-toolbar-control="page-size"]')).toBeVisible();
});

test("移动端页面助手使用全屏会话而不是悬浮卡片", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/workspace/work/me");

  await page.getByRole("button", { name: "页面助手", exact: true }).click();
  const assistant = page.getByRole("region", { name: "页面助手", exact: true });
  await expect(assistant).toBeVisible();
  const assistantBox = await assistant.boundingBox();
  expect(Math.round(assistantBox?.x ?? -1)).toBe(0);
  expect(Math.round(assistantBox?.y ?? -1)).toBe(0);
  expect(Math.round(assistantBox?.width ?? -1)).toBe(390);
  expect(Math.round(assistantBox?.height ?? -1)).toBe(844);

  const close = page.getByRole("button", { name: "关闭页面助手", exact: true });
  const closeBox = await close.boundingBox();
  expect(closeBox?.x).toBeLessThanOrEqual(16);
  expect(closeBox?.width).toBeGreaterThanOrEqual(44);
});

test("desktop-only section 在触屏横屏下仍保持隐藏", async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL),
    hasTouch: true,
    isMobile: true,
    storageState: E2E_ADMIN_STORAGE_STATE,
    viewport: { width: 844, height: 390 },
  });
  try {
    const page = await context.newPage();
    await page.goto("/workspace/login");
    const state = await page.evaluate(() => {
      const desktopOnly = document.createElement("div");
      desktopOnly.className = "body-surface-desktop-only";
      desktopOnly.textContent = "desktop only";
      document.body.append(desktopOnly);
      return {
        coarse: window.matchMedia("(pointer: coarse)").matches,
        display: getComputedStyle(desktopOnly).display,
        landscape: window.matchMedia("(orientation: landscape)").matches,
      };
    });
    expect(state).toEqual({ coarse: true, display: "none", landscape: true });
  } finally {
    await context.close();
  }
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
