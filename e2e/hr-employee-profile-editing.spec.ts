import { expect, test, type Locator, type Page } from "@playwright/test";
import type { EmployeeProfile } from "@workspace/hr/types";
import { E2E_ADMIN_STORAGE_STATE } from "./support/auth";

test.use({ storageState: E2E_ADMIN_STORAGE_STATE });
test.describe.configure({ retries: 0 });

const EMPLOYEE_KEY = "E2E-HR-EDIT-001";
const PROFILE_PATH = `/workspace/hr/roster/employees/${EMPLOYEE_KEY}`;
const PROFILE_API_PATH = `/workspace/api/modules/hr/roster/employee-profiles/${EMPLOYEE_KEY}`;

test("员工档案所有来源字段都有可审计的编辑入口", {
  tag: ["@critical", "@nightly", "@hr-employee-profile-editing"],
}, async ({ page }) => {
  await page.route(`**${PROFILE_API_PATH}`, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(profileFixture()) });
  });

  const response = await page.goto(PROFILE_PATH, { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response!.status()).toBeLessThan(400);
  await expect(page.getByRole("tab", { name: "基本信息", exact: true })).toBeVisible();

  for (const label of [
    "员工编号",
    "姓名",
    "别名",
    "性别",
    "出生年月",
    "民族",
    "籍贯",
    "政治面貌",
    "学历",
    "职称",
    "毕业院校",
    "专业",
    "参加工作时间",
    "电话",
    "身份证号",
    "其他证件号",
    "关联账号",
  ]) {
    await expectEditableField(page, label);
  }
  await expectReadOnlyField(page, "农历生日");

  await page.getByRole("tab", { name: "雇佣关系", exact: true }).click();
  for (const label of ["人员类型", "职级", "职务", "办公地点"]) {
    await expectEditableField(page, label);
  }
  await page.getByRole("button", { name: "纠正这条记录", exact: true }).click();
  for (const label of ["用工公司", "开始日期", "结束日期", "纠正原因"]) {
    await expectEditableField(page, label, "纠正雇佣历史");
  }

  await page.getByRole("row").filter({ hasText: "劳动合同" }).first().click();
  await expect(page.getByText("协议资料待补充：第 3 期到期日期。不影响正常续签或终止。", { exact: true })).toBeVisible();
  await expectEditableField(page, "第 3 期到期日期");
  await expectEditableField(page, "补充说明");
  await expect(page.getByRole("button", { name: "保存补充资料", exact: true })).toBeDisabled();

  await page.getByRole("tab", { name: "社会保险", exact: true }).click();
  await page.getByRole("row").filter({ hasText: "已参保" }).first().click();
  await page.getByRole("button", { name: "修正已登记资料", exact: true }).click();
  for (const label of ["社保状态", "参保公司", "参保月份", "停保月份", "停保原因", "备注", "修正说明"]) {
    await expectEditableField(page, label);
  }

  await page.getByRole("tab", { name: "任职管理", exact: true }).click();
  await page.getByRole("button", { name: "纠正这条记录", exact: true }).click();
  for (const label of ["汇报公司", "部门", "岗位", "主岗", "岗位投入权重", "汇报岗位", "开始日期", "结束日期", "纠正原因"]) {
    await expectEditableField(page, label, "纠正任职历史");
  }
});

async function expectEditableField(page: Page, label: string, sectionTitle?: string) {
  const scope = sectionTitle ? sectionContaining(page, sectionTitle) : page.locator("body");
  const cell = fieldCell(scope, label);
  await expect(cell, `${label} field`).toBeVisible();
  const controls = cell.locator("input:not([type=hidden]), textarea, button").filter({ visible: true });
  expect(await controls.count(), `${label} should expose an interactive control`).toBeGreaterThan(0);
  for (const control of await controls.all()) {
    await expect(control, `${label} control`).toBeEnabled();
    await expect(control, `${label} control must not be semantically read-only`).not.toHaveAttribute("aria-readonly", "true");
  }
}

async function expectReadOnlyField(page: Page, label: string) {
  const cell = fieldCell(page.locator("body"), label);
  await expect(cell, `${label} field`).toBeVisible();
  await expect(cell.locator("input:not([type=hidden]), textarea, button").filter({ visible: true })).toHaveCount(0);
}

function fieldCell(scope: Locator, label: string) {
  return scope
    .getByText(new RegExp(`^${escapeRegExp(label)}\\s*\\*?$`))
    .filter({ visible: true })
    .last()
    .locator("xpath=ancestor::div[parent::*[@data-field-grid-mode]][1]");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sectionContaining(page: Page, title: string) {
  return page.getByText(title, { exact: true }).filter({ visible: true }).last().locator("xpath=ancestor::section[1]");
}

function profileFixture(): EmployeeProfile {
  return {
    asOfDate: "2026-07-29",
    employee: {
      id: 90001,
      employeeId: EMPLOYEE_KEY,
      name: "浏览器编辑测试员工",
      alias: "[\"测试别名\"]",
      gender: true,
      birthDate: "1990-01-15",
      ethnicity: "汉族",
      hometown: "上海",
      politics: "群众",
      education: "本科",
      title: "工程师",
      school: "测试大学",
      major: "计算机科学与技术",
      phone: "13800000001",
      workStartDate: "2012-07-01",
      idNumber: "31010119900115001X",
      otherId: "E2E-PASSPORT",
      userId: 2,
      userName: "admin",
      username: "admin",
    },
    summary: {
      status: "在职",
      currentCompany: "丰华制药",
      reportingCompanyId: 1,
      reportingCompanyName: "丰华制药",
      departmentId: 1001,
      departmentName: "人力资源部",
      departmentPath: "丰华制药 / 人力资源部",
      positionId: 2001,
      positionName: "HRBP",
    },
    employments: [{
      id: 3001,
      version: 1,
      employeeId: 90001,
      isActive: true,
      currentCompany: "丰华制药",
      joinDate: "2020-01-01",
      leaveDate: null,
      leaveReason: null,
      leaveNote: null,
      officeLocation: "上海",
      personnelType: "正式员工",
      rank: "P4",
      title: "职员",
      temporalState: "current",
    }],
    contracts: [{
      id: "agreement-e2e",
      agreementUid: "11111111-1111-4111-8111-111111111111",
      employmentId: 3001,
      employeeId: EMPLOYEE_KEY,
      employeeName: "浏览器编辑测试员工",
      company: "丰华制药",
      isPrimary: true,
      isInsuredHere: true,
      insuranceStatus: "insured",
      legalRelation: "劳动关系",
      contractType: "劳动合同",
      employmentForm: "全日制",
      firstContractStartDate: "2020-01-01",
      firstContractEndDate: "2022-12-31",
      secondContractStartDate: "2023-01-01",
      secondContractEndDate: "2025-12-31",
      thirdContractStartDate: "2026-01-01",
      thirdContractEndDate: null,
      permanentContractDate: null,
      expiryDate: null,
      confidentialityDate: null,
      nonCompeteDate: null,
      endDate: null,
      recordState: "confirmed",
      temporalState: "current",
      version: 1,
      source: "normalized",
      migrationState: "baseline",
      missingFields: [{ path: "terms.3.effectiveThrough", label: "第 3 期到期日期", required: false }],
      currentRevisionUid: "22222222-2222-4222-8222-222222222222",
      terms: [
        term("31111111-1111-4111-8111-111111111111", 1, "2020-01-01", "2022-12-31", "past"),
        term("32222222-2222-4222-8222-222222222222", 2, "2023-01-01", "2025-12-31", "past"),
        term("33333333-3333-4333-8333-333333333333", 3, "2026-01-01", null, "current"),
      ],
      revisions: [{
        revisionUid: "22222222-2222-4222-8222-222222222222",
        revisionNo: 1,
        recordState: "confirmed",
        changeKind: "baseline-import",
        content: {
          company: "丰华制药",
          insuranceStatus: "insured",
          legalRelation: "劳动关系",
          contractType: "劳动合同",
          employmentForm: "全日制",
          confidentialityDate: null,
          nonCompeteDate: null,
        },
        supersedesRevisionUid: null,
        reason: "E2E baseline",
        createdAt: "2026-07-01T00:00:00.000Z",
      }],
      attachments: [],
    }],
    socialInsurancePeriods: [{
      periodUid: "44444444-4444-4444-8444-444444444444",
      companyId: 1,
      companyName: "丰华制药",
      insuranceStatus: "insured",
      startMonth: "2020-01",
      endMonth: null,
      status: "insured",
      stopReason: null,
      note: "正常参保",
      missingFields: [],
      version: 1,
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    }],
    edps: [{
      id: 5001,
      version: 1,
      employeeId: 90001,
      reportingCompanyId: 1,
      reportingCompanyName: "丰华制药",
      departmentId: 1001,
      departmentName: "人力资源部",
      departmentPath: "丰华制药 / 人力资源部",
      positionId: 2001,
      positionReportOverrideId: null,
      positionName: "HRBP",
      isPrimary: true,
      startDate: "2020-01-01",
      endDate: null,
      reportTo: "人力资源总监",
      reportToPositionId: 2002,
      allocationWeight: "1.0000",
      allocationPercent: 1,
      temporalState: "current",
    }],
    lifecycleEvents: [],
  };
}

function term(
  termUid: string,
  sequence: number,
  effectiveFrom: string,
  effectiveThrough: string | null,
  temporalState: "past" | "current",
) {
  return {
    termUid,
    sequence,
    termKind: sequence === 1 ? "initial" as const : "renewal" as const,
    effectiveFrom,
    effectiveThrough,
    recordState: "confirmed" as const,
    temporalState,
    changeKind: "baseline-import",
    reason: null,
  };
}
