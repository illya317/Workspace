import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { matchEmployee } from "@/lib/search";
import { FENGHUA_BIO_GROUP, resolveCompanyFilter } from "@/lib/company";

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

// 字段权限暂未启用，所有 canAccessHR 用户均可查看全部字段
async function getVisibleFields(_userId: number, isAdmin: boolean): Promise<string[]> {
  return FIELDS.map((f) => f.key);
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isWorkListAdmin: true, canAccessHR: true },
  });

  if (!user?.canAccessHR && !user?.isWorkListAdmin) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company") || "";
  const dept = searchParams.get("dept") || "";
  const keyword = searchParams.get("keyword") || "";
  const exportExcel = searchParams.get("export") === "1";
  console.log("[employees API] params:", { company, dept, keyword, exportExcel, isAdmin: user?.isWorkListAdmin });

  // 在职/离职筛选（默认只看在职）
  const statusFilter = searchParams.get("status") || "在职";
  const employeeWhere: any = {};
  if (statusFilter === "在职") {
    employeeWhere.status = "在职";
    employeeWhere.deleted = false;
  } else if (statusFilter === "离职") {
    employeeWhere.status = "离职";
  }

  // 1. 获取基础员工列表
  let baseEmployees = await prisma.employee.findMany({
    where: employeeWhere,
    orderBy: [{ employeeId: "asc" }],
  });

  // 关键词支持拼音首字母搜索
  if (keyword) {
    baseEmployees = baseEmployees.filter((e) => matchEmployee(e, keyword));
  }

  const employeeIds = baseEmployees.map((e) => e.id);
  const empMap = new Map(baseEmployees.map((e) => [e.id, e]));

  // 2. 查询 EmployeePosition（带部门和岗位筛选）
  const epWhere: any = { employeeId: { in: employeeIds } };
  if (dept) {
    epWhere.department = { name: { contains: dept } };
  }

  // 公司隔离：非管理员只能看自己公司数据
  const targetCompany = company || "";
  if (targetCompany) {
    epWhere.department = {
      ...(epWhere.department || {}),
      companyCode: { in: resolveCompanyFilter(targetCompany) },
    };
  }

  const eps = await prisma.employeePosition.findMany({
    where: epWhere,
    include: { department: true, position: true },
    orderBy: [{ employeeId: "asc" }, { sortOrder: "asc" }],
  });

  // 3. 扁平化为前端兼容格式
  function flattenRow(emp: any, ep: any) {
    return {
      id: emp.id,
      employeeId: emp.employeeId,
      name: emp.name,
      alias: emp.alias,
      company: ep?.companyCode ?? "",
      center: ep?.center ?? "",
      dept1: ep?.department?.name ?? "",
      dept2: "",
      position: ep?.position?.name ?? "",
      gender: emp.gender,
      ethnicity: emp.ethnicity,
      hometown: emp.hometown,
      politics: emp.politics,
      education: emp.education,
      title: emp.title,
      school: emp.school,
      major: emp.major,
      majorRelevant: emp.majorRelevant,
      phone: emp.phone,
      office1: emp.office1,
      office2: emp.office2,
      office3: emp.office3,
      attendance1: emp.attendance1,
      attendance2: emp.attendance2,
      joinDate: emp.joinDate,
      nature: emp.nature,
      status: emp.status,
      leaveDate: emp.leaveDate,
      deleted: emp.deleted,
      deletedTime: emp.deletedTime,
      deletedBy: emp.deletedBy,
      userId: emp.userId,
      employeePositionId: ep?.id ?? null,
    };
  }

  const rows: any[] = [];
  const epEmpIds = new Set(eps.map((ep) => ep.employeeId));

  for (const ep of eps) {
    const emp = empMap.get(ep.employeeId);
    if (emp) rows.push(flattenRow(emp, ep));
  }

  // 无岗位筛选时，补充没有 EmployeePosition 的员工
  if (!dept && !targetCompany) {
    for (const emp of baseEmployees) {
      if (!epEmpIds.has(emp.id)) {
        rows.push(flattenRow(emp, null));
      }
    }
  }

  // 保持 employeeId 排序，同员工多岗位保持连续
  rows.sort((a, b) => a.employeeId.localeCompare(b.employeeId));
  console.log("[employees API] rows count:", rows.length, "baseEmployees:", baseEmployees.length, "eps:", eps.length);

  const visibleFields = await getVisibleFields(payload.userId, !!user?.isWorkListAdmin);

  if (exportExcel) {
    const exportData = rows.map((emp) => {
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
  const deptWhere: any = {};
  const allCompanies = [...new Set((await prisma.department.findMany({ where: deptWhere, select: { companyCode: true } })).map((d: any) => d.companyCode).filter(Boolean))];
  const allDepts = [...new Set((await prisma.department.findMany({ where: deptWhere, select: { name: true } })).map((d: any) => d.name).filter(Boolean))];

  return NextResponse.json({ employees: rows, fields: FIELDS, visibleFields, allCompanies, allDepts });
}
