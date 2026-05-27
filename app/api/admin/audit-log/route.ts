import { NextResponse } from "next/server";
import { authenticate, checkHRAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { resolveFkValues, fkDisplay } from "@/lib/resolve-fk";

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

// Custom name resolvers for models where a single field isn't enough
async function resolveRecordNames(entityType: string, ids: number[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (entityType === "EDP") {
    const edps = await prisma.eDP.findMany({
      where: { id: { in: ids } },
      include: { employee: { select: { name: true } } },
    });
    for (const e of edps) map[String(e.id)] = e.employee?.name || String(e.id);
  } else if (entityType === "EmployeeProject") {
    const eps = await prisma.employeeProject.findMany({
      where: { id: { in: ids } },
      include: { employee: { select: { name: true } }, project: { select: { name: true } } },
    });
    for (const e of eps) map[String(e.id)] = `${e.employee?.name || "?"} / ${e.project?.name || "?"}`;
  } else if (entityType === "Employment") {
    const emps = await prisma.employment.findMany({
      where: { id: { in: ids } },
      include: { employee: { select: { name: true } } },
    });
    for (const e of emps) map[String(e.id)] = e.employee?.name || String(e.id);
  }
  return map;
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!(await checkHRAccess(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const date = searchParams.get("date") || undefined;
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "50"), 200);

  if (!entityType) return NextResponse.json({ error: "缺少 entityType" }, { status: 400 });

  // 列出有编辑记录的日期
  if (searchParams.get("dates") === "1") {
    const rows = await prisma.editHistory.findMany({
      where: { entityType, tag: null },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    });
    const dates = [...new Set(rows.map((r) => r.createdAt.toISOString().slice(0, 10)))];
    return NextResponse.json({ dates });
  }

  // 按日期筛选
  const pageWhere: Prisma.EditHistoryWhereInput = { entityType, tag: null };
  if (date) {
    pageWhere.createdAt = {
      gte: new Date(date + "T00:00:00+08:00"),
      lte: new Date(date + "T23:59:59+08:00"),
    };
  }

  const pageVersions = await prisma.editHistory.findMany({
    where: pageWhere,
    orderBy: { createdAt: "desc" },
    take: pageSize,
    skip: (page - 1) * pageSize,
    include: { editor: { select: { name: true } } },
  });
  const total = await prisma.editHistory.count({ where: pageWhere });

  const recordIds = [...new Set(pageVersions.map((v) => parseInt(v.entityId)))];
  const recordIdStrs = recordIds.map(String);

  // 拉取这些记录的全部版本（含 V0），用于准确 diff
  const allVersions = await prisma.editHistory.findMany({
    where: { entityType, entityId: { in: recordIdStrs } },
    orderBy: { version: "asc" },
    include: { editor: { select: { name: true } } },
  });

  type VersionWithEditor = Prisma.EditHistoryGetPayload<{ include: { editor: { select: { name: true } } } }>;
  const prevMap = new Map<number, VersionWithEditor>();
  const groupMap = new Map<string, VersionWithEditor[]>();
  for (const v of allVersions) {
    const k = `${v.entityType}:${v.entityId}`;
    if (!groupMap.has(k)) groupMap.set(k, []);
    groupMap.get(k)!.push(v);
  }
  for (const [, group] of groupMap) {
    for (let i = 1; i < group.length; i++) prevMap.set(group[i].id, group[i - 1]);
  }

  const recordMap = await resolveRecordNames(entityType, recordIds);
  // Fallback to generic resolver for unmatched IDs
  const resolver = RESOLVERS[entityType];
  if (resolver) {
    const unresolved = recordIds.filter((id) => !recordMap[String(id)]);
    if (unresolved.length > 0) {
      type ModelDelegate = { findMany: (args: { where: { id: { in: number[] } }; select: Record<string, boolean> }) => Promise<Array<{ id: unknown; [key: string]: unknown }>> };
      const records = await ((prisma as unknown as Record<string, ModelDelegate>)[resolver.model]).findMany({
        where: { id: { in: unresolved } },
        select: { id: true, [resolver.field]: true },
      });
      for (const r of records) recordMap[String(r.id)] = String(r[resolver.field] ?? resolver.fallback);
    }
  }
  // Last resort
  for (const id of recordIds) if (!recordMap[String(id)]) recordMap[String(id)] = String(id);

  const AUDIT_FIELDS = new Set(["editedBy", "editedAt", "version", "editor", "createdAt", "updatedAt", "id"]);

  // Batch resolve FK values using shared module
  const allSnapshots = pageVersions.map((v) => { try { return JSON.parse(v.dataJson); } catch { return {}; } });
  const fkMap = await resolveFkValues(allSnapshots);

  const editedIds = new Set(pageVersions.map((v) => `${v.entityType}:${v.entityId}`));
  const displayV0s = allVersions.filter((v) => v.tag && editedIds.has(`${v.entityType}:${v.entityId}`));

  const entries = [...pageVersions, ...displayV0s]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((v) => {
      const prev = prevMap.get(v.id) || null;
      const changes: Array<{ field: string; from?: string; to: string }> = [];
      try {
        const currData = JSON.parse(v.dataJson);
        const prevData = prev ? JSON.parse(prev.dataJson) : null;
        const keys = new Set([...Object.keys(currData), ...(prevData ? Object.keys(prevData) : [])]);
        for (const key of keys) {
          if (AUDIT_FIELDS.has(key)) continue;
          const curr = currData[key];
          const old = prevData?.[key];
          if (JSON.stringify(old) !== JSON.stringify(curr)) {
            const fromRaw = old != null ? (typeof old === "object" ? JSON.stringify(old) : String(old)) : "";
            const toRaw = curr != null ? (typeof curr === "object" ? JSON.stringify(curr) : String(curr)) : "";
            changes.push({
              field: key,
              from: fromRaw ? fkDisplay(key, fromRaw, fkMap) : "(空)",
              to: toRaw ? fkDisplay(key, toRaw, fkMap) : "(空)",
            });
          }
        }
      } catch {}

      return {
        id: v.id, entityId: v.entityId,
        entityName: recordMap[v.entityId] || v.entityId,
        version: v.version,
        editorName: v.editor?.name || `用户#${v.editedBy}`,
        createdAt: v.createdAt,
        tag: v.tag || null,
        changes,
      };
    });

  return NextResponse.json({ entries, total, page, pageSize });
}
