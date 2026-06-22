import { formatDepartmentPath } from "@workspace/hr/utils/department-path";
import { matchSearchFields } from "@workspace/platform/search";
import { prisma } from "@workspace/platform/server/prisma";
import type {
  RosterGeneratedColumn,
  RosterGeneratedFilters,
  RosterGeneratedGroup,
  RosterGeneratedPreview,
  RosterGeneratedRow,
  RosterGeneratedStatus,
  RosterGeneratedVariant,
} from "@workspace/hr/types";
import { buildContractRows, type ContractRow } from "./contract-records";
import { primaryContractCompany } from "./employments";

const MANAGEMENT_COLUMNS: RosterGeneratedColumn[] = [
  { key: "employeeId", label: "员工编号", scope: "employee", required: true },
  { key: "name", label: "姓名", scope: "employee", required: true },
  { key: "currentCompany", label: "当前公司", scope: "employee", defaultVisible: true },
  { key: "gender", label: "性别", scope: "employee", defaultVisible: true },
  { key: "education", label: "学历", scope: "employee", defaultVisible: true },
  { key: "phone", label: "电话", scope: "employee" },
  { key: "isActive", label: "在职状态", scope: "employee", defaultVisible: true },
  { key: "joinDate", label: "入职日期", scope: "employee", defaultVisible: true },
  { key: "personnelType", label: "人员类型", scope: "employee" },
  { key: "rank", label: "职级", scope: "employee", defaultVisible: true },
  { key: "employmentTitle", label: "职务", scope: "employee", defaultVisible: true },
  { key: "officeLocation", label: "办公地点", scope: "employee" },
  { key: "departmentName", label: "部门", scope: "row", defaultVisible: true },
  { key: "positionName", label: "岗位", scope: "row", defaultVisible: true },
  { key: "isPrimaryPosition", label: "主岗", scope: "row", defaultVisible: true },
  { key: "workPercent", label: "工作占比", scope: "row" },
  { key: "reportTo", label: "直接上级", scope: "row" },
];

const DUE_DILIGENCE_COLUMNS: RosterGeneratedColumn[] = [
  { key: "employeeId", label: "员工编号", scope: "employee", required: true },
  { key: "name", label: "姓名", scope: "employee", required: true },
  { key: "currentCompany", label: "当前公司", scope: "employee", defaultVisible: true },
  { key: "gender", label: "性别", scope: "employee", defaultVisible: true },
  { key: "education", label: "学历", scope: "employee" },
  { key: "isActive", label: "在职状态", scope: "employee", defaultVisible: true },
  { key: "joinDate", label: "入职日期", scope: "employee", defaultVisible: true },
  { key: "leaveDate", label: "离职日期", scope: "employee" },
  { key: "departmentName", label: "部门", scope: "row", defaultVisible: true },
  { key: "positionName", label: "岗位", scope: "row", defaultVisible: true },
  { key: "positionStartDate", label: "任岗开始", scope: "row" },
  { key: "positionEndDate", label: "任岗结束", scope: "row" },
  { key: "company", label: "合同公司", scope: "row", defaultVisible: true },
  { key: "contractType", label: "合同类型", scope: "row", defaultVisible: true },
  { key: "legalRelation", label: "法律关系", scope: "row", defaultVisible: true },
  { key: "employmentForm", label: "用工形式", scope: "row" },
  { key: "insuranceStatus", label: "参保状态", scope: "row" },
  { key: "firstContractStartDate", label: "首签开始", scope: "row" },
  { key: "endDate", label: "合同终止", scope: "row" },
];

export interface RosterGeneratedPreviewInput extends RosterGeneratedFilters {
  page?: number;
  pageSize?: number;
}

export interface RosterGeneratedCsvInput extends RosterGeneratedFilters {
  fields?: string[];
  blankMergedCells?: boolean;
}

type RosterEmployeeRecord = Awaited<ReturnType<typeof loadRosterEmployees>>[number];

export async function previewRosterGenerated(input: RosterGeneratedPreviewInput): Promise<RosterGeneratedPreview> {
  const variant = normalizeVariant(input.variant);
  const status = normalizeStatus(input.status);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(10000, Math.max(1, input.pageSize ?? 50));
  const columns = columnsForVariant(variant);
  const employees = await loadRosterEmployees();
  const filtered = filterEmployees(employees, {
    variant,
    keyword: input.keyword?.trim() ?? "",
    status,
    filterField: input.filterField ?? "",
    filterValue: input.filterValue ?? "",
  });
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const groups = paged.map((employee) => buildGroup(employee, variant));

  return {
    variant,
    title: variant === "management" ? "管理版花名册" : "尽调版花名册",
    generatedAt: new Date().toISOString(),
    filters: {
      variant,
      keyword: input.keyword?.trim() || undefined,
      status,
      filterField: input.filterField || undefined,
      filterValue: input.filterValue || undefined,
    },
    columns,
    groups,
    totalEmployees: filtered.length,
    totalRows: groups.reduce((sum, group) => sum + group.rows.length, 0),
  };
}

export async function renderRosterGeneratedCsv(input: RosterGeneratedCsvInput): Promise<string> {
  const preview = await previewRosterGenerated({
    variant: input.variant,
    keyword: input.keyword,
    status: input.status,
    filterField: input.filterField,
    filterValue: input.filterValue,
    page: 1,
    pageSize: 10000,
  });
  const requestedFields = new Set(input.fields?.filter(Boolean) ?? []);
  const columns = requestedFields.size > 0
    ? preview.columns.filter((column) => column.required || requestedFields.has(column.key))
    : preview.columns.filter((column) => column.required || column.defaultVisible);
  const lines = [columns.map((column) => escapeCsvCell(column.label)).join(",")];
  for (const group of preview.groups) {
    group.rows.forEach((row, rowIndex) => {
      lines.push(columns.map((column) => {
        if (column.scope === "employee" && input.blankMergedCells && rowIndex > 0) return "";
        const value = column.scope === "employee" ? group.employeeCells[column.key] : row.cells[column.key];
        return escapeCsvCell(value ?? "");
      }).join(","));
    });
  }
  return lines.join("\n");
}

function columnsForVariant(variant: RosterGeneratedVariant) {
  return variant === "management" ? MANAGEMENT_COLUMNS : DUE_DILIGENCE_COLUMNS;
}

async function loadRosterEmployees() {
  return prisma.employee.findMany({
    include: {
      employments: {
        orderBy: [{ isActive: "desc" }, { id: "desc" }],
      },
      positions: {
        include: {
          department: { include: { parent: { include: { parent: true } } } },
          position: { include: { department: { include: { parent: { include: { parent: true } } } } } },
        },
        orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
      },
    },
    orderBy: { employeeId: "asc" },
  });
}

function filterEmployees(
  employees: RosterEmployeeRecord[],
  filters: Required<Pick<RosterGeneratedFilters, "variant" | "status">> & {
    keyword: string;
    filterField: string;
    filterValue: string;
  },
) {
  return employees.filter((employee) => {
    const active = isEmployeeActive(employee);
    if (filters.status === "active" && !active) return false;
    if (filters.status === "inactive" && active) return false;
    const primaryEmployment = primaryEmploymentFor(employee);
    const primaryPosition = employee.positions[0];
    const searchable = {
      employeeId: employee.employeeId,
      name: employee.name,
      currentCompany: primaryEmployment ? primaryContractCompany(primaryEmployment.contracts, primaryEmployment.currentCompany) : "",
      departmentName: departmentNameFor(primaryPosition),
      positionName: primaryPosition?.position?.name ?? "",
      education: employee.education ?? "",
      rank: primaryEmployment?.rank ?? "",
      personnelType: primaryEmployment?.personnelType ?? "",
    };
    if (filters.filterField && filters.filterValue && !matchSearchFields(searchable, filters.filterValue, [filters.filterField])) {
      return false;
    }
    if (filters.keyword && !matchSearchFields(searchable, filters.keyword, ["employeeId", "name", "currentCompany", "departmentName", "positionName"])) {
      return false;
    }
    return true;
  });
}

function buildGroup(employee: RosterEmployeeRecord, variant: RosterGeneratedVariant): RosterGeneratedGroup {
  const primaryEmployment = primaryEmploymentFor(employee);
  const contracts = buildContractRows(employee.employments.map((employment) => ({
    id: employment.id,
    contracts: employment.contracts,
    employee: { employeeId: employee.employeeId, name: employee.name },
  })));
  const rowCount = Math.max(1, employee.positions.length, contracts.length);
  return {
    employeeKey: String(employee.id),
    employeeCells: {
      employeeId: employee.employeeId,
      name: employee.name,
      currentCompany: primaryEmployment ? primaryContractCompany(primaryEmployment.contracts, primaryEmployment.currentCompany) ?? "" : "",
      gender: genderLabel(employee.gender),
      education: employee.education ?? "",
      phone: variant === "management" ? employee.phone ?? "" : "",
      isActive: isEmployeeActive(employee) ? "在职" : "离职",
      joinDate: primaryEmployment?.joinDate ?? "",
      leaveDate: primaryEmployment?.leaveDate ?? "",
      personnelType: primaryEmployment?.personnelType ?? "",
      rank: primaryEmployment?.rank ?? "",
      employmentTitle: primaryEmployment?.title ?? "",
      officeLocation: primaryEmployment?.officeLocation ?? "",
    },
    rows: Array.from({ length: rowCount }, (_, index) => buildExpandedRow(employee, contracts, index)),
  };
}

function buildExpandedRow(employee: RosterEmployeeRecord, contracts: ContractRow[], index: number): RosterGeneratedRow {
  const position = employee.positions[index] ?? null;
  const contract = contracts[index] ?? null;
  return {
    key: `${employee.id}-${index}`,
    cells: {
      departmentName: departmentNameFor(position),
      positionName: position?.position?.name ?? "",
      isPrimaryPosition: position ? position.isPrimary ? "是" : "否" : "",
      positionStartDate: position?.startDate ?? "",
      positionEndDate: position?.endDate ?? "",
      workPercent: position?.workPercent ?? "",
      reportTo: position?.reportTo ?? "",
      company: contract?.company ?? "",
      contractType: contract?.contractType ?? "",
      legalRelation: contract?.legalRelation ?? "",
      employmentForm: contract?.employmentForm ?? "",
      insuranceStatus: contract?.insuranceStatus ?? "",
      firstContractStartDate: contract?.firstContractStartDate ?? "",
      endDate: contract?.endDate ?? "",
    },
  };
}

function primaryEmploymentFor(employee: RosterEmployeeRecord) {
  return employee.employments.find((employment) => employment.isActive) ?? employee.employments[0] ?? null;
}

function isEmployeeActive(employee: RosterEmployeeRecord) {
  return employee.employments.some((employment) => employment.isActive);
}

function departmentNameFor(position: RosterEmployeeRecord["positions"][number] | null) {
  if (!position) return "";
  return formatDepartmentPath(position.position?.department ?? position.department) || position.position?.department?.name || position.department?.name || "";
}

function genderLabel(value: boolean | null) {
  if (value === true) return "男";
  if (value === false) return "女";
  return "";
}

function normalizeVariant(value: RosterGeneratedVariant): RosterGeneratedVariant {
  return value === "dueDiligence" ? "dueDiligence" : "management";
}

function normalizeStatus(value?: RosterGeneratedStatus): RosterGeneratedStatus {
  if (value === "active" || value === "inactive") return value;
  return "all";
}

function escapeCsvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
