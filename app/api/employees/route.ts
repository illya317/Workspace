import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { matchEmployee } from "@/lib/search";

// 字段列表（顺序）
const FIELDS = [
  { key: "employeeId", label: "ID" },
  { key: "name", label: "姓名" },
  { key: "alias", label: "别名" },
  { key: "company", label: "公司" },
  { key: "center", label: "中心" },
  { key: "dept1", label: "一级部门" },
  { key: "dept2", label: "二级部门" },
  { key: "position", label: "职务岗位" },
  { key: "gender", label: "性别" },
  { key: "ethnicity", label: "民族" },
  { key: "hometown", label: "籍贯" },
  { key: "politics", label: "政治面貌" },
  { key: "education", label: "学历" },
  { key: "title", label: "职称" },
  { key: "school", label: "毕业院校" },
  { key: "major", label: "专业" },
  { key: "majorRelevant", label: "是否相关专业" },
  { key: "phone", label: "电话" },
  { key: "joinDate", label: "进司时间" },
  { key: "nature", label: "性质" },
];

async function getVisibleFields(userId: number, isAdmin: boolean): Promise<string[]> {
  if (isAdmin) return FIELDS.map((f) => f.key);

  // 查询该用户的字段权限例外规则
  const perms = await prisma.fieldPermission.findMany({
    where: { userId },
  });

  const denyFields = new Set(
    perms.filter((p) => !p.canRead).map((p) => p.field)
  );

  return FIELDS.map((f) => f.key).filter((f) => !denyFields.has(f));
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isWorkListAdmin: true, canAccessHR: true, company: true },
  });

  if (!user?.canAccessHR && !user?.isWorkListAdmin) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company") || "";
  const dept = searchParams.get("dept") || "";
  const keyword = searchParams.get("keyword") || "";
  const exportExcel = searchParams.get("export") === "1";

  // 丰华生物/天力通/悦通/加拿大 共享数据
  const SHARED_COMPANIES = ["丰华生物", "丰华天力通", "丰华悦通", "加拿大"];
  function resolveCompanyFilter(companyName: string): any {
    if (SHARED_COMPANIES.includes(companyName)) {
      return { in: SHARED_COMPANIES };
    }
    return companyName;
  }

  const where: any = {};
  // 公司隔离：非管理员只能看自己公司数据
  if (!user?.isWorkListAdmin && user?.company) {
    where.company = resolveCompanyFilter(user.company);
  } else if (company) {
    where.company = resolveCompanyFilter(company);
  }
  if (dept) where.dept1 = { contains: dept };

  // 在职/全部筛选（默认只看在职）
  const statusFilter = searchParams.get("status") || "在职";
  if (statusFilter === "在职") {
    where.status = "在职";
    where.deleted = false;
  }

  const employees = await prisma.employee.findMany({
    where,
    orderBy: [{ employeeId: "asc" }],
  });

  // 关键词支持拼音首字母搜索
  let filteredEmployees = employees;
  if (keyword) {
    const query = keyword.toLowerCase();
    filteredEmployees = employees.filter((e) => matchEmployee(e, query));
  }

  const visibleFields = await getVisibleFields(payload.userId, !!user?.isWorkListAdmin);

  if (exportExcel) {
    // 按权限过滤字段后导出 Excel
    const exportData = filteredEmployees.map((emp) => {
      const row: Record<string, any> = {};
      for (const f of FIELDS) {
        if (visibleFields.includes(f.key)) {
          row[f.label] = (emp as any)[f.key] || "";
        }
      }
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "花名册");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="roster_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  }

  // 所有公司和部门（不随筛选变化，用于下拉框）
  const companyWhere: any = {};
  if (!user?.isWorkListAdmin && user?.company) {
    companyWhere.company = resolveCompanyFilter(user.company);
  }
  const allCompanies = [...new Set((await prisma.employee.findMany({ where: companyWhere, select: { company: true } })).map(e => e.company).filter(Boolean))];
  const allDepts = [...new Set((await prisma.employee.findMany({ where: companyWhere, select: { dept1: true } })).map(e => e.dept1).filter(Boolean))];

  return NextResponse.json({ employees: filteredEmployees, fields: FIELDS, visibleFields, allCompanies, allDepts });
}
