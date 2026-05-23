import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// entityType → 用于 resolve 记录名称的 Prisma model key & display field
const RESOLVERS: Record<string, { model: string; field: string; fallback: string }> = {
  Employee: { model: "employee", field: "name", fallback: "未知员工" },
  Employment: { model: "employment", field: "id", fallback: "未知雇佣" },
  Company: { model: "company", field: "name", fallback: "未知公司" },
  CompanyRelation: { model: "companyRelation", field: "id", fallback: "未知关系" },
  Department: { model: "department", field: "name", fallback: "未知部门" },
  Position: { model: "position", field: "name", fallback: "未知岗位" },
  EDP: { model: "eDP", field: "id", fallback: "未知关联" },
  Project: { model: "project", field: "name", fallback: "未知项目" },
  EmployeeProject: { model: "employeeProject", field: "id", fallback: "未知关联" },
};

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "50"), 200);

  if (!entityType) return NextResponse.json({ error: "缺少 entityType" }, { status: 400 });

  const total = await prisma.editHistory.count({ where: { entityType } });

  const versions = await prisma.editHistory.findMany({
    where: { entityType },
    orderBy: [{ entityId: "asc" }, { version: "desc" }],
    take: pageSize,
    skip: (page - 1) * pageSize,
    include: { editor: { select: { name: true } } },
  });

  // Resolve record names in batch
  const resolver = RESOLVERS[entityType];
  const recordIds = [...new Set(versions.map((v) => parseInt(v.entityId)))];
  const recordMap: Record<string, string> = {};

  if (resolver) {
    const records = await (prisma as any)[resolver.model].findMany({
      where: { id: { in: recordIds } },
      select: { id: true, [resolver.field]: true },
    });
    for (const r of records) {
      recordMap[String(r.id)] = String(r[resolver.field] ?? resolver.fallback);
    }
  }

  // Build diff: compare with previous version of same record
  const entries = versions.map((v, i) => {
    const prev = versions[i + 1]; // next in array = previous version (desc order)
    const diff: string[] = [];
    if (prev && prev.entityId === v.entityId && prev.version === v.version - 1) {
      try {
        const prevData = JSON.parse(prev.dataJson);
        const currData = JSON.parse(v.dataJson);
        for (const key of Object.keys(currData)) {
          if (JSON.stringify(prevData[key]) !== JSON.stringify(currData[key])) {
            diff.push(key);
          }
        }
      } catch {}
    }

    return {
      id: v.id,
      entityId: v.entityId,
      entityName: recordMap[v.entityId] || v.entityId,
      version: v.version,
      editorName: v.editor?.name || `用户#${v.editedBy}`,
      createdAt: v.createdAt,
      changedFields: diff,
    };
  });

  return NextResponse.json({ entries, total, page, pageSize });
}
