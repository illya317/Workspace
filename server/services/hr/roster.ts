import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import * as XLSX from "xlsx";
import { matchAnyField } from "@/lib/search-schema";
import { loadCompanyMap, isPharmaSync, getCompanyNameSync } from "@/server/services/hr/company-directory";

export const ROSTER_FIELDS = [
  { key: "employeeId", label: "ID" },
  { key: "name", label: "姓名" },
  { key: "alias", label: "别名" },
  { key: "company", label: "公司" },
  { key: "center", label: "中心" },
  { key: "dept1", label: "一级部门" },
  { key: "dept2", label: "二级部门" },
  { key: "position", label: "行政职务" },
  { key: "gmpDept", label: "GMP部门" },
  { key: "gmpPosition", label: "GMP岗位" },
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

export async function getVisibleFields(_userId: number, _isAdmin: boolean): Promise<string[]> {
  return ROSTER_FIELDS.map((f) => f.key);
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
  if (keyword) employees = employees.filter((e) => matchAnyField(e, keyword, "Employee"));
  return employees;
}

export interface RosterRow {
  id: number;
  employeeId: string;
  name: string;
  alias: string | null;
  company: string;
  center: string;
  dept1: string;
  dept2: string;
  position: string;
  gmpDept: string;
  gmpPosition: string;
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
  let baseEmployees = await prisma.employee.findMany({
    orderBy: [{ employeeId: "asc" }],
  });

  if (keyword) {
    baseEmployees = baseEmployees.filter((e) => matchAnyField(e, keyword, "Employee"));
  }

  const employeeIds = baseEmployees.map((e) => e.id);

  const epWhere: Prisma.EDPWhereInput = { employeeId: { in: employeeIds } };
  if (dept) {
    epWhere.department = { name: { contains: dept } };
  }

  const [eps, companyMap] = await Promise.all([
    prisma.eDP.findMany({
      where: epWhere,
      include: { department: true, position: true },
      orderBy: [{ employeeId: "asc" }],
    }),
    loadCompanyMap(),
  ]);

  const epByEmp = new Map<number, typeof eps>();
  for (const ep of eps) {
    if (!epByEmp.has(ep.employeeId)) epByEmp.set(ep.employeeId, []);
    epByEmp.get(ep.employeeId)!.push(ep);
  }

  const rows: RosterRow[] = [];
  for (const emp of baseEmployees) {
    const epsForEmp = epByEmp.get(emp.id) || [];
    const defEP = epsForEmp.find((e) => !isPharmaSync(companyMap, e.department?.code || "")) || epsForEmp[0];
    const gmpEP = epsForEmp.find((e) => isPharmaSync(companyMap, e.department?.code || ""));
    const companyName = getCompanyNameSync(companyMap, defEP?.department?.code || "");
    rows.push({
      id: emp.id,
      employeeId: emp.employeeId,
      name: emp.name,
      alias: formatAlias(emp.alias),
      company: companyName,
      center: "",
      dept1: defEP?.department?.name ?? "",
      dept2: "",
      position: defEP?.position?.name ?? "",
      gmpDept: gmpEP?.department?.name ?? "",
      gmpPosition: gmpEP?.position?.name ?? "",
      gender: emp.gender,
      ethnicity: emp.ethnicity,
      hometown: emp.hometown,
      politics: emp.politics,
      education: emp.education,
      title: emp.title,
      school: emp.school,
      major: emp.major,
      phone: emp.phone,
      joinDate: "",
      nature: "",
      status: "",
      leaveDate: "",
      userId: emp.userId,
      eDPId: defEP?.id ?? null,
    });
  }

  rows.sort((a, b) => a.employeeId.localeCompare(b.employeeId));
  return rows;
}

export function buildRosterExcel(rows: RosterRow[], visibleFields: string[]): Buffer {
  const exportData = rows.map((emp) => {
    const row: Record<string, unknown> = {};
    for (const f of ROSTER_FIELDS) {
      if (visibleFields.includes(f.key)) {
        row[f.label] = (emp as unknown as Record<string, unknown>)[f.key] || "";
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
  const depts = await prisma.department.findMany({ select: { name: true } });
  return [...new Set(depts.map((d) => d.name).filter(Boolean))];
}
