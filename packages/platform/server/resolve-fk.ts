import { prisma } from "./prisma";

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

/** Resolve FK ids found in data rows into display names. */
export async function resolveFkValues(rows: Record<string, unknown>[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};

  await Promise.all(
    Object.entries(FK_CONFIG).map(async ([key, cfg]) => {
      const ids = Array.from(
        new Set(
          rows
            .map((row) => row[key])
            .filter((value): value is number | string => value != null && typeof value !== "object")
            .map(Number),
        ),
      ).filter((id) => !Number.isNaN(id));
      if (ids.length === 0) return;

      try {
        const model = (
          prisma as unknown as Record<
            string,
            {
              findMany: (args: {
                where: { id: { in: number[] } };
                select: Record<string, boolean>;
              }) => Promise<Array<Record<string, unknown>>>;
            }
          >
        )[cfg.model];
        const records = await model.findMany({
          where: { id: { in: ids } },
          select: { id: true, [cfg.field]: true },
        });
        for (const record of records) map[`${cfg.model}:${record.id}`] = String(record[cfg.field] ?? record.id);
      } catch {
        // FK display is best-effort; callers still show the raw value.
      }
    }),
  );

  return map;
}

/** Convert one FK field value into its resolved display name when available. */
export function fkDisplay(field: string, value: string, fkMap: Record<string, string>): string {
  const cfg = FK_CONFIG[field];
  if (cfg && /^\d+$/.test(value)) {
    const resolved = fkMap[`${cfg.model}:${value}`];
    if (resolved) return resolved;
  }
  return value;
}
