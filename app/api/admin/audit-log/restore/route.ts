import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const RESOLVERS: Record<string, string> = {
  Employee: "employee", Employment: "employment", Company: "company",
  CompanyRelation: "companyRelation", Department: "department",
  Position: "position", EDP: "eDP", Project: "project",
  EmployeeProject: "employeeProject",
};

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { historyId } = await request.json();
  if (!historyId) return NextResponse.json({ error: "缺少 historyId" }, { status: 400 });

  const snapshot = await prisma.editHistory.findUnique({ where: { id: historyId } });
  if (!snapshot) return NextResponse.json({ error: "版本不存在" }, { status: 404 });

  const modelKey = RESOLVERS[snapshot.entityType];
  if (!modelKey) return NextResponse.json({ error: "不支持的实体类型" }, { status: 400 });

  let data: Record<string, unknown>;
  try { data = JSON.parse(snapshot.dataJson); } catch { return NextResponse.json({ error: "数据格式错误" }, { status: 500 }); }

  delete data.id; // 不能改主键
  // 保留快照里的 editedBy/editedAt/version，不做新版本也不覆盖审计信息

  const entityId = parseInt(snapshot.entityId);
  await (prisma as any)[modelKey].update({
    where: { id: entityId },
    data,
  });

  return NextResponse.json({ success: true });
}
