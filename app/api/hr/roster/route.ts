import { NextResponse } from "next/server";
import { authenticate, checkHRAccess, checkPermission } from "@/lib/auth";
import {
  ROSTER_FIELDS,
  getVisibleFields,
  queryRawEmployees,
  buildRosterRows,
  buildRosterExcel,
  getAllDepartmentNames,
} from "@/server/services/hr/roster";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId, "access", "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("raw") === "1";
  const dept = searchParams.get("dept") || "";
  const keyword = searchParams.get("keyword") || "";
  const exportExcel = searchParams.get("export") === "1";
  const isAdmin = await checkPermission(payload.userId, "system", "admin");

  if (raw) {
    const employees = await queryRawEmployees(keyword);
    return NextResponse.json({ employees });
  }

  const rows = await buildRosterRows(dept, keyword);
  const visibleFields = await getVisibleFields(payload.userId, isAdmin);

  if (exportExcel) {
    const buf = buildRosterExcel(rows, visibleFields);
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="roster_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  }

  const allCompanies = ["丰华制药", "丰华生物"];
  const allDepts = await getAllDepartmentNames();

  return NextResponse.json({ employees: rows, fields: ROSTER_FIELDS, visibleFields, allCompanies, allDepts });
}
