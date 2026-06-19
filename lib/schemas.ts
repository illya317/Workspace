import { z } from "zod";
import { parseJson } from "@workspace/platform/server/api";

// ─── Auth ────────────────────────────────────────────────

export const LoginSchema = z.object({
  username: z.string().min(1, "账号不能为空"),
  password: z.string().min(1, "密码不能为空"),
});

export const DevLoginSchema = LoginSchema;

// ─── HR Core ─────────────────────────────────────────────

export const EmployeeCreateSchema = z.object({
  employeeId: z.string().min(1, "员工编号必填"),
  name: z.string().min(1, "姓名必填"),
  alias: z.string().optional().nullable(),
  gender: z.union([z.boolean(), z.string()]).optional().nullable(),
  birthDate: z.string().optional().nullable(),
  ethnicity: z.string().optional().nullable(),
  hometown: z.string().optional().nullable(),
  politics: z.string().optional().nullable(),
  education: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  school: z.string().optional().nullable(),
  major: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  workStartDate: z.string().optional().nullable(),
  idNumber: z.string().optional().nullable(),
  otherId: z.string().optional().nullable(),
  userId: z.coerce.number().optional().nullable(),
});

export const DepartmentCreateSchema = z.object({
  code: z.string().min(1, "编码必填"),
  name: z.string().min(1, "名称必填"),
  alias: z.string().optional().nullable(),
  level: z.number().optional().nullable(),
  parentId: z.coerce.number().optional().nullable(),
  managerUserId: z.coerce.number().optional().nullable(),
});

export const PositionCreateSchema = z.object({
  code: z.string().min(1, "编码必填"),
  name: z.string().min(1, "名称必填"),
  alias: z.string().optional().nullable(),
  departmentId: z.union([z.number(), z.string()]).optional().nullable(),
  positionDescriptionId: z.coerce.number().optional().nullable(),
});

export const EDPCreateSchema = z.object({
  employeeId: z.coerce.number().min(1, "员工ID必填"),
  departmentId: z.coerce.number().optional().nullable(),
  positionId: z.coerce.number().optional().nullable(),
  isPrimary: z.union([z.boolean(), z.string()]).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  reportTo: z.string().optional().nullable(),
  workPercent: z.string().optional().nullable(),
});

export const ProjectCreateSchema = z.object({
  name: z.string().min(1, "名称不能为空"),
  type: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

export const ContractCreateSchema = z.object({
  name: z.string().min(1, "合同名称必填"),
  contractNo: z.string().optional().nullable(),
  partyA: z.string().optional().nullable(),
  partyB: z.string().optional().nullable(),
  shareholder: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  handler: z.string().optional().nullable(),
  signDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  amount: z.union([z.number(), z.string()]).optional().nullable(),
  executedAmount: z.union([z.number(), z.string()]).optional().nullable(),
  location: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
});

// ─── Finance ─────────────────────────────────────────────

export const FinanceAccountCreateSchema = z.object({
  code: z.string().min(1, "科目编码必填"),
  name: z.string().min(1, "科目名称必填"),
  category: z.string().min(1, "科目类别必填"),
  parentId: z.union([z.number(), z.string()]).optional().nullable(),
  balanceDirection: z.string().optional().nullable(),
  companyCode: z.string().optional().nullable(),
});

export const FinanceVoucherCreateSchema = z.object({
  voucherNo: z.string().min(1, "凭证号必填"),
  date: z.string().min(1, "日期必填"),
  periodId: z.coerce.number().min(1, "会计期间必填"),
  description: z.string().min(1, "摘要必填"),
  companyCode: z.string().optional().nullable(),
  items: z.array(z.object({
    accountId: z.coerce.number().min(1),
    debit: z.number().optional().nullable(),
    credit: z.number().optional().nullable(),
    description: z.string().optional().nullable(),
  })).min(2, "至少需要两条分录"),
});

export const FinancePeriodCreateSchema = z.object({
  year: z.number().min(2000).max(2100),
  month: z.number().min(1).max(12),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  companyCode: z.string().optional().nullable(),
});

// ─── Inventory ───────────────────────────────────────────

export const StockRawMaterialCreateSchema = z.object({
  code: z.string().min(1, "编码必填"),
  name: z.string().min(1, "名称必填"),
  spec: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  manufacturer: z.string().optional().nullable(),
  companyCode: z.string().optional().nullable(),
});

export const StockPackagingCreateSchema = z.object({
  code: z.string().min(1, "编码必填"),
  name: z.string().min(1, "名称必填"),
  spec: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  packagingType: z.string().optional().nullable(),
  companyCode: z.string().optional().nullable(),
});

export const StockFinishedGoodsCreateSchema = z.object({
  code: z.string().min(1, "编码必填"),
  name: z.string().min(1, "名称必填"),
  packagingSpec: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  stockType: z.string().optional().nullable(),
  companyCode: z.string().optional().nullable(),
});

// ─── Request helpers ─────────────────────────────────────

export { parseJson };
