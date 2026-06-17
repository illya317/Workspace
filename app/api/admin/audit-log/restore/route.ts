import { NextResponse } from "next/server";
import { authenticate, checkHRWrite } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESOLVERS: Record<string, string> = {
  Employee: "employee", Employment: "employment", Company: "company",
  CompanyRelation: "companyRelation", Department: "department",
  Position: "position", EDP: "eDP", Project: "project",
  EmployeeProject: "employeeProject",
};

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRWrite(payload.userId, "people.roster"))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { historyId } = await request.json();
  if (!historyId) return NextResponse.json({ error: "缺少 historyId" }, { status: 400 });

  const { prisma } = await import("@/lib/prisma");
  const snapshot = await prisma.editHistory.findUnique({ where: { id: historyId } });
  if (!snapshot) return NextResponse.json({ error: "版本不存在" }, { status: 404 });

  const modelKey = RESOLVERS[snapshot.entityType];
  if (!modelKey) return NextResponse.json({ error: "不支持的实体类型" }, { status: 400 });

  let data: Record<string, unknown>;
  try { data = JSON.parse(snapshot.dataJson); } catch { return NextResponse.json({ error: "数据格式错误" }, { status: 500 }); }

  delete data.id; // 不能改主键
  // 保留快照里的 editedBy/editedAt/version，不做新版本也不覆盖审计信息

  const entityId = parseInt(snapshot.entityId);
  // 如果记录已被删除，用 create 恢复
  type ModelDelegate = {
    findUnique: (args: { where: { id: number } }) => Promise<unknown>;
    update: (args: { where: { id: number }; data: unknown }) => Promise<unknown>;
    create: (args: { data: unknown }) => Promise<unknown>;
  };
  const model = (prisma as unknown as Record<string, ModelDelegate>)[modelKey];
  const exists = await model.findUnique({ where: { id: entityId } });
  if (exists) {
    await model.update({ where: { id: entityId }, data });
  } else {
    await model.create({ data: { ...data, id: entityId } });
  }

  return NextResponse.json({ success: true });
}
