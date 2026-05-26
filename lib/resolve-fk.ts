// 通用 FK 值 → 显示名称解析
import { prisma } from "@/lib/prisma";

const FK_CONFIG: Record<string, { model: string; field: string }> = {
  departmentId: { model: "department", field: "name" },
  positionId: { model: "position", field: "name" },
  employeeId: { model: "employee", field: "name" },
  projectId: { model: "project", field: "name" },
  managerUserId: { model: "user", field: "name" },
  userId: { model: "user", field: "name" },
  parentId: { model: "department", field: "name" },
  childId: { model: "company", field: "name" },
  positionDescriptionId: { model: "positionDescription", field: "name" },
};

/** 批量解析 FK 值：从一组 data JSON 中提取所有 FK 字段，返回 { "department:42" → "研发中心" } */
export async function resolveFkValues(rows: Record<string, unknown>[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};

  await Promise.all(
    Object.entries(FK_CONFIG).map(async ([key, cfg]) => {
      const ids = Array.from(new Set(rows.map((r) => r[key]).filter((v): v is number => v != null && typeof v !== "object").map(Number))).filter((n) => !isNaN(n));
      if (ids.length === 0) return;
      try {
        const records = await (prisma as any)[cfg.model].findMany({
          where: { id: { in: ids } },
          select: { id: true, [cfg.field]: true },
        });
        for (const r of records) map[`${cfg.model}:${r.id}`] = String(r[cfg.field] ?? r.id);
      } catch {}
    })
  );

  return map;
}

/** 单个 FK 值转显示名 */
export function fkDisplay(field: string, value: string, fkMap: Record<string, string>): string {
  const cfg = FK_CONFIG[field];
  if (cfg && /^\d+$/.test(value)) {
    const resolved = fkMap[`${cfg.model}:${value}`];
    if (resolved) return resolved;
  }
  return value;
}
