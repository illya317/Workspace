import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_ADMIN_STORAGE_STATE } from "./support/auth";
import { parseReadinessBudget, recordReadyTransition } from "./support/readiness";

const READY_BUDGET_MS = 30_000;
const SLOW_READY_BUDGET_MS = parseReadinessBudget(
  process.env.E2E_READY_SLOW_BUDGET_MS,
  { fallbackMs: 15_000, maximumMs: READY_BUDGET_MS },
);
test.use({ storageState: E2E_ADMIN_STORAGE_STATE });
test.describe.configure({ retries: 0 });

interface ModuleReadinessCase {
  id: string;
  label: string;
  path: string;
  pageTitle: string;
  apiPaths?: string[];
  ready: (page: Page) => Promise<void>;
}

function any(...locators: Locator[]) {
  return locators.reduce((combined, locator) => combined.or(locator)).first();
}

const readinessCases: ModuleReadinessCase[] = [
  {
    id: "hr-roster",
    label: "HR 花名册",
    path: "/workspace/hr/roster",
    pageTitle: "人事基础资料",
    apiPaths: ["/workspace/api/modules/hr/roster/employees"],
    ready: async (page) => {
      await expect(page.getByText("员工资料", { exact: true }).first())
        .toBeVisible({ timeout: READY_BUDGET_MS });
      await expect(any(
        page.getByRole("table"),
        page.getByText("暂无员工", { exact: true }),
      )).toBeVisible({ timeout: READY_BUDGET_MS });
    },
  },
  {
    id: "work-home",
    label: "Work 主入口",
    path: "/workspace/work",
    pageTitle: "工作管理",
    ready: (page) => expect(page.getByText("工作空间", { exact: true }).first())
      .toBeVisible({ timeout: READY_BUDGET_MS }),
  },
  {
    id: "work-project",
    label: "Work 项目",
    path: "/workspace/work/project",
    pageTitle: "项目管理",
    apiPaths: [
      "/workspace/api/modules/work/projects",
      "/workspace/api/modules/work/projects/members",
    ],
    ready: async (page) => {
      await expect(page.getByText("项目列表", { exact: true }).first())
        .toBeVisible({ timeout: READY_BUDGET_MS });
      await expect(any(
        page.getByText("请选择左侧项目", { exact: true }),
        page.getByText("暂无项目", { exact: true }),
      )).toBeVisible({ timeout: READY_BUDGET_MS });
    },
  },
  {
    id: "finance-home",
    label: "Finance 主入口",
    path: "/workspace/finance",
    pageTitle: "财务管理",
    ready: (page) => expect(page.getByText("总账会计", { exact: true }))
      .toBeVisible({ timeout: READY_BUDGET_MS }),
  },
  {
    id: "production-qc",
    label: "Production QC",
    path: "/workspace/production/qc",
    pageTitle: "批次检验",
    ready: (page) => expect(page.getByText(/批次队列 · \d+/).first())
      .toBeVisible({ timeout: READY_BUDGET_MS }),
  },
  {
    id: "inventory-operations",
    label: "Inventory 运营台",
    path: "/workspace/inventory/operations",
    pageTitle: "库存运营",
    ready: (page) => expect(any(
      page.getByText("物料", { exact: true }),
      page.getByText("请选择公司和期间", { exact: true }),
    )).toBeVisible({ timeout: READY_BUDGET_MS }),
  },
  {
    id: "library-basic-info",
    label: "Library 基础资料",
    path: "/workspace/library/basic-info",
    pageTitle: "资料库",
    apiPaths: [
      "/workspace/api/modules/library/basic-info/documents",
      "/workspace/api/modules/library/basic-info/directories",
    ],
    ready: (page) => expect(any(
      page.getByRole("table"),
      page.getByText("暂无资料", { exact: true }),
    )).toBeVisible({ timeout: READY_BUDGET_MS }),
  },
  {
    id: "external-customers",
    label: "External 客户",
    path: "/workspace/external/customers",
    pageTitle: "客户管理",
    apiPaths: ["/workspace/api/modules/external/customers"],
    ready: (page) => expect(page.getByText("客户目录", { exact: true }))
      .toBeVisible({ timeout: READY_BUDGET_MS }),
  },
  {
    id: "administration-home",
    label: "Administration 主入口",
    path: "/workspace/administration",
    pageTitle: "行政管理",
    ready: (page) => expect(page.getByText("合同台账", { exact: true }))
      .toBeVisible({ timeout: READY_BUDGET_MS }),
  },
];

for (const readinessCase of readinessCases) {
  test(`${readinessCase.label} 首屏进入可用或明确空态`, {
    tag: ["@nightly", "@latency", "@module-readiness", `@${readinessCase.id}`],
  }, async ({ page }, testInfo) => {
    await recordReadyTransition({
      page,
      testInfo,
      name: readinessCase.id,
      slowBudgetMs: SLOW_READY_BUDGET_MS,
      requiredUrlPaths: [readinessCase.path, ...(readinessCase.apiPaths ?? [])],
      trigger: async () => {
        const apiResponses = (readinessCase.apiPaths ?? []).map((apiPath) => (
          page.waitForResponse((response) => (
            response.request().method() === "GET"
            && new URL(response.url()).pathname === apiPath
          ), { timeout: READY_BUDGET_MS })
        ));
        const navigationResponse = await page.goto(readinessCase.path, {
          waitUntil: "domcontentloaded",
          timeout: READY_BUDGET_MS,
        });
        expect(navigationResponse, `${readinessCase.label} navigation response`).not.toBeNull();
        expect(navigationResponse!.status(), `${readinessCase.label} navigation status`).toBeLessThan(400);
        for (const response of await Promise.all(apiResponses)) {
          expect(response.ok(), `${readinessCase.label} ${new URL(response.url()).pathname}`).toBeTruthy();
        }
      },
      waitUntilReady: async () => {
        await expect(page.getByText(readinessCase.pageTitle, { exact: true }).first())
          .toBeVisible({ timeout: READY_BUDGET_MS });
        await readinessCase.ready(page);
        await expect(page.getByText(/加载(?:.{0,24})失败|Failed to load/i)).toHaveCount(0);
      },
    });
  });
}
