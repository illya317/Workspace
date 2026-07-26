import { Prisma } from "@workspace/platform/server/prisma";
import { prisma } from "@workspace/platform/server/prisma";
import { matchAnyField } from "@workspace/platform/search";
import * as XLSX from "xlsx";
import { getCompanyNameSync, isRegulatedManagementGroupSync, listActiveCompanies, loadCompanyMap } from "@workspace/platform/server/company-directory";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";

export function rosterFields() {
  const roster = getTenantProfile().hr.roster;
  return [
  { key: "employeeId", label: "ID" },
  { key: "name", label: "姓名" },
  { key: "alias", label: "别名" },
  { key: "company", label: "公司" },
  { key: "center", label: "中心" },
  { key: "dept1", label: "一级部门" },
  { key: "dept2", label: "二级部门" },
  { key: "position", label: "行政职务" },
  { key: roster.secondaryDepartmentFieldKey, label: roster.secondaryDepartmentLabel },
  { key: roster.secondaryPositionFieldKey, label: roster.secondaryPositionLabel },
  { key: "gender", label: "性别" },
  { key: "ethnicity", label: "民族" },
  { key: "hometown", label: "籍贯" },
  { key: "politics", label: "政治面貌" },
  { key: "education", label: "学历" },
  { key: "title", label: "职称" },
  { key: "school", label: "毕业院校" },
  { key: "major", label: "专业" },
  { key: "phone", label: "电话" },
  { key: "joinDate", label: "进司时间" },
  { key: "nature", label: "性质" },
  ];
}

export async function getVisibleFields(_userId: number, _isAdmin: boolean): Promise<string[]> {
  return rosterFields().map((field) => field.key);
}

function formatAlias(value: string | null) {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).join("、") : value;
  } catch {
    return value;
  }
}

export async function queryRawEmployees(keyword: string) {
  let employees = await prisma.employee.findMany({ orderBy: { employeeId: "asc" } });
  if (keyword) employees = employees.filter((employee) => matchAnyField(employee, keyword, "Employee"));
  return employees;
}

export interface RosterRow {
  [key: string]: unknown;
  id: number;
  employeeId: string;
  name: string;
  alias: string | null;
  company: string;
  center: string;
  dept1: string;
  dept2: string;
  position: string;
  gender: boolean | null;
  ethnicity: string | null;
  hometown: string | null;
  politics: string | null;
  education: string | null;
  title: string | null;
  school: string | null;
  major: string | null;
  phone: string | null;
  joinDate: string;
  nature: string;
  status: string;
  leaveDate: string;
  userId: number | null;
  eDPId: number | null;
}

export async function buildRosterRows(dept: string, keyword: string): Promise<RosterRow[]> {
  const roster = getTenantProfile().hr.roster;
  let baseEmployees = await prisma.employee.findMany({
    orderBy: [{ employeeId: "asc" }],
  });

  if (keyword) {
    baseEmployees = baseEmployees.filter((employee) => matchAnyField(employee, keyword, "Employee"));
  }

  const employeeIds = baseEmployees.map((employee) => employee.id);

  const epWhere: Prisma.EDPWhereInput = { employeeId: { in: employeeIds } };
  if (dept) {
    epWhere.department = { name: { contains: dept, mode: "insensitive" } };
  }

  const [edps, companyMap] = await Promise.all([
    prisma.eDP.findMany({
      where: epWhere,
      include: { department: true, position: true },
      orderBy: [{ employeeId: "asc" }],
    }),
    loadCompanyMap(),
  ]);

  const edpsByEmployee = new Map<number, typeof edps>();
  for (const edp of edps) {
    if (!edpsByEmployee.has(edp.employeeId)) edpsByEmployee.set(edp.employeeId, []);
    edpsByEmployee.get(edp.employeeId)!.push(edp);
  }

  const rows: RosterRow[] = [];
  for (const employee of baseEmployees) {
    const employeeEdps = edpsByEmployee.get(employee.id) || [];
    const defaultEdp =
      employeeEdps.find((edp) => !isRegulatedManagementGroupSync(companyMap, edp.department?.code || "")) || employeeEdps[0];
    const regulatedEdp = employeeEdps.find((edp) => isRegulatedManagementGroupSync(companyMap, edp.department?.code || ""));
    const companyName = getCompanyNameSync(companyMap, defaultEdp?.department?.code || "");
    rows.push({
      id: employee.id,
      employeeId: employee.employeeId,
      name: employee.name,
      alias: formatAlias(employee.alias),
      company: companyName,
      center: "",
      dept1: defaultEdp?.department?.name ?? "",
      dept2: "",
      position: defaultEdp?.position?.name ?? "",
      [roster.secondaryDepartmentFieldKey]: regulatedEdp?.department?.name ?? "",
      [roster.secondaryPositionFieldKey]: regulatedEdp?.position?.name ?? "",
      gender: employee.gender,
      ethnicity: employee.ethnicity,
      hometown: employee.hometown,
      politics: employee.politics,
      education: employee.education,
      title: employee.title,
      school: employee.school,
      major: employee.major,
      phone: employee.phone,
      joinDate: "",
      nature: "",
      status: "",
      leaveDate: "",
      userId: employee.userId,
      eDPId: defaultEdp?.id ?? null,
    });
  }

  rows.sort((a, b) => a.employeeId.localeCompare(b.employeeId));
  return rows;
}

export function buildRosterExcel(rows: RosterRow[], visibleFields: string[]): Buffer {
  const exportData = rows.map((employee) => {
    const row: Record<string, unknown> = {};
    for (const field of rosterFields()) {
      if (visibleFields.includes(field.key)) {
        row[field.label] = (employee as unknown as Record<string, unknown>)[field.key] || "";
      }
    }
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "花名册");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

export async function getAllDepartmentNames(): Promise<string[]> {
  const departments = await prisma.department.findMany({ select: { name: true } });
  return [...new Set(departments.map((department) => department.name).filter(Boolean))];
}

export async function getRosterFilterOptions() {
  const [companies, departments] = await Promise.all([listActiveCompanies(), getAllDepartmentNames()]);
  return {
    allCompanies: companies.map((company) => company.name),
    allDepts: departments,
  };
}
