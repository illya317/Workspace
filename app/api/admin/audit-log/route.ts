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
  const tag = searchParams.get("tag") || undefined; // V0 日期筛选
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "50"), 200);

  if (!entityType) return NextResponse.json({ error: "缺少 entityType" }, { status: 400 });

  // 自动确保今天有 V0（首次打开审计日志时触发）
  const today = new Date().toISOString().slice(0, 10);
  const v0Tag = `V0:${today}`;
  const resolver = RESOLVERS[entityType];

  if (!tag && resolver) {
    const hasEditsToday = await prisma.editHistory.findFirst({
      where: { entityType, createdAt: { gte: new Date(today + "T00:00:00+08:00") }, tag: null },
    });
    if (hasEditsToday) {
      const hasV0 = await prisma.editHistory.findFirst({
        where: { entityType, tag: v0Tag },
      });
      if (!hasV0) {
        // 异步补 V0，不阻塞响应
        const records = await (prisma as any)[resolver.model].findMany({ select: { id: true } });
        for (const r of records) {
          const existing = await prisma.editHistory.findFirst({
            where: { entityType, entityId: String(r.id), tag: v0Tag },
          });
          if (!existing) {
            const record = await (prisma as any)[resolver.model].findUnique({ where: { id: r.id } });
            if (record) {
              await prisma.editHistory.create({
                data: {
                  entityType, entityId: String(r.id), version: 0, tag: v0Tag,
                  dataJson: JSON.stringify(record), editedBy: 0,
                },
              });
            }
          }
        }
      }
    }
  }

  // List available V0 tags for date filter
  if (searchParams.get("tags") === "1") {
    const tags = await prisma.editHistory.findMany({
      where: { entityType, tag: { not: null } },
      select: { tag: true },
      orderBy: { tag: "desc" },
      distinct: ["tag"],
      take: 30,
    });
    return NextResponse.json({ tags: tags.map((t) => t.tag) });
  }

  const where: any = { entityType };
  if (tag) where.tag = tag;

  // 拉当前页 + 同记录 V0（用于 diff）
  const pageVersions = await prisma.editHistory.findMany({
    where: tag ? where : { entityType, tag: null },
    orderBy: { createdAt: "desc" },
    take: pageSize,
    skip: (page - 1) * pageSize,
    include: { editor: { select: { name: true } } },
  });
  const total = await prisma.editHistory.count({ where: tag ? where : { entityType, tag: null } });

  // 补上当前页记录的 V0 用于 diff
  const recordIds = [...new Set(pageVersions.map((v) => parseInt(v.entityId)))];
  const v0s = tag ? [] : await prisma.editHistory.findMany({
    where: { entityType, entityId: { in: recordIds.map(String) }, tag: { not: null } },
    include: { editor: { select: { name: true } } },
  });
  const versions = [...pageVersions, ...v0s];
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

  const AUDIT_FIELDS = new Set(["editedBy", "editedAt", "version", "editor", "createdAt", "updatedAt", "id"]);

  // Group by record, sort by version within each group, build diffs
  const grouped: Record<string, any[]> = {};
  for (const v of versions) {
    const key = `${v.entityType}:${v.entityId}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(v);
  }

  const prevMap: Record<number, any> = {};
  for (const key of Object.keys(grouped)) {
    const group = grouped[key].sort((a, b) => b.version - a.version); // version desc
    for (let i = 0; i < group.length; i++) {
      prevMap[group[i].id] = group[i + 1] || null; // next in group = previous version
    }
  }

  const entries = versions.map((v) => {
    const prev = prevMap[v.id];
    const isFirst = !prev;
    const changes: Array<{ field: string; from?: string; to: string }> = [];

    try {
      const currData = JSON.parse(v.dataJson);
      if (isFirst) {
        for (const key of Object.keys(currData)) {
          if (AUDIT_FIELDS.has(key)) continue;
          const val = currData[key];
          if (val !== null && val !== undefined && val !== "") {
            changes.push({ field: key, to: typeof val === "object" ? JSON.stringify(val) : String(val) });
          }
        }
      } else {
        try {
          const prevData = JSON.parse(prev!.dataJson);
          for (const key of Object.keys(currData)) {
            if (AUDIT_FIELDS.has(key)) continue;
            const curr = currData[key];
            const old = prevData[key];
            if (JSON.stringify(old) !== JSON.stringify(curr)) {
              changes.push({
                field: key,
                from: old != null ? (typeof old === "object" ? JSON.stringify(old) : String(old)) : "(空)",
                to: curr != null ? (typeof curr === "object" ? JSON.stringify(curr) : String(curr)) : "(空)",
              });
            }
          }
        } catch {}
      }
    } catch {}

    return {
      id: v.id,
      entityId: v.entityId,
      entityName: recordMap[v.entityId] || v.entityId,
      version: v.version,
      editorName: v.editor?.name || `用户#${v.editedBy}`,
      createdAt: v.createdAt,
      tag: v.tag || null,
      isFirst,
      changes,
    };
  });

  // 默认隐藏 V0 基线条目，仅展示编辑版本
  const visible = tag ? entries : entries.filter((e) => !e.tag);
  return NextResponse.json({ entries: visible, total, page, pageSize });
}
