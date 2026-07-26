import { Prisma } from "@workspace/platform/server/prisma";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import { snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { currentEmploymentDateWhere, currentOpenEndedDateWhere } from "@workspace/platform/server/relation-registry";
import { matchAnyField } from "@workspace/platform/search";
import { deriveDepartmentCodeCascade } from "@workspace/hr/utils/department-code-cascade";
import { getCompanyNameSync, loadCompanyMap } from "@workspace/platform/server/company-directory";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import {
  businessTemporalIdempotencyMatches,
  businessTemporalRequestFingerprint,
} from "@workspace/platform/server/business-temporal-idempotency";
import { type CrudDeleteCommand } from "./hr-crud";
import {
  buildDepartmentUpdateCommand,
  validateDepartmentDelete,
  type DepartmentCreateCommand,
  type DepartmentUpdateInput,
  type DepartmentUpdateCommand,
} from "./domain/department-validation";
import {
  resolveHrDepartmentActionRuntime,
  type DepartmentMutationAuthorization,
} from "./department-action-runtime";
import {
  applyDepartmentStructureChange,
  applyPositionStructureChange,
  createDepartmentWithInitialVersion,
  OrganizationStructureConcurrentUpdateError,
  OrganizationStructureIdempotencyConflictError,
  runOrganizationStructureTransaction,
  organizationTimeline,
  type DepartmentStructurePayload,
  type PositionStructurePayload,
} from "./organization-structure-lifecycle-service";

function parseDetails(details: string | null) {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function selectedDetails(record: object): string | null {
  if (!("details" in record)) return null;
  return typeof record.details === "string" ? record.details : null;
}

const managerEmployeeSelect = {
  id: true,
  name: true,
  userId: true,
} as const;

function hierarchyKind(value: string | null | undefined) {
  return value === "G" ? "G" : "M";
}

function organizationLevelCode(department: { hierarchyKind?: string | null; level: number }) {
  return `${hierarchyKind(department.hierarchyKind)}${department.level}`;
}

function organizationLevelLabel(department: { hierarchyKind?: string | null; level: number }) {
  const kind = hierarchyKind(department.hierarchyKind);
  if (kind === "G") {
    if (department.level === 1) return "治理层级 G1";
    if (department.level === 2) return "治理层级 G2";
    return "治理层级 G3";
  }
  if (department.level === 1) return "管理层级 M1";
  if (department.level === 2) return "管理层级 M2";
  return "管理层级 M3 / 子部门";
}

function managerEmployeeNames(
  managerPosition: {
    edps?: Array<{
      employee: {
        id: number;
        name: string;
        userId: number | null;
      };
    }>;
  } | null | undefined,
) {
  const byEmployee = new Map<number, {
    employeeId: number;
    userId: number | null;
    name: string;
  }>();
  for (const edp of managerPosition?.edps ?? []) {
    const employee = edp.employee;
    byEmployee.set(employee.id, {
      employeeId: employee.id,
      userId: employee.userId,
      name: employee.name || "未命名员工",
    });
  }
  return Array.from(byEmployee.values());
}

export async function listDepartments(input: { keyword: string; page: number; pageSize: number; archived?: boolean; summary?: boolean; userId?: number }) {
  const asOfDate = workspaceBusinessDate(new Date());
  const [depts, companyMap, actionRuntimes] = await Promise.all([
    prisma.department.findMany({
      include: {
        _count: { select: { edps: true } },
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true } },
        managerPosition: {
          select: {
            id: true,
            name: true,
            code: true,
            edps: {
              where: currentOpenEndedDateWhere({
                employee: { employments: { some: currentEmploymentDateWhere() } },
              }),
              select: {
                employee: { select: managerEmployeeSelect },
              },
              orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
            },
          },
        },
        descriptions: {
          select: input.summary
            ? { id: true, sourceFile: true, codeRaw: true }
            : { id: true, sourceFile: true, codeRaw: true, details: true },
          orderBy: { id: "asc" },
        },
        effectiveVersions: {
          orderBy: { sequence: "asc" },
          select: {
            id: true,
            sequence: true,
            validFrom: true,
            validToExclusive: true,
            recordState: true,
            changeKind: true,
            supersedesId: true,
            code: true,
            name: true,
            alias: true,
            hierarchyKind: true,
            level: true,
            parentId: true,
            managerPositionId: true,
            sourceChange: { select: { reason: true, recordedAt: true, actorUserId: true } },
          },
        },
      },
      orderBy: input.archived ? [{ archivedAt: "desc" }, { id: "desc" }] : [{ hierarchyKind: "asc" }, { level: "asc" }, { id: "asc" }],
    }),
    loadCompanyMap(),
    input.userId
      ? Promise.all([
          resolveHrDepartmentActionRuntime(input.userId, "create"),
          resolveHrDepartmentActionRuntime(input.userId, "update"),
        ]).then(([create, update]) => ({ create, update }))
      : null,
  ]);

  let departments = depts.map((department) => {
    const managers = managerEmployeeNames(department.managerPosition);
    const managerNames = managers.map((manager) => manager.name);
    const timeline = organizationTimeline(department.effectiveVersions.map((row) => ({
      id: row.id,
      sequence: row.sequence,
      validFrom: row.validFrom,
      validToExclusive: row.validToExclusive,
      recordState: row.recordState,
      supersedesId: row.supersedesId,
      payload: departmentPayload(row),
    })), asOfDate);
    const temporal = temporalView(timeline, department.effectiveVersions);
    const effective = temporal.current?.payload ?? departmentPayload(department);
    return {
      id: department.id,
      code: effective.code,
      name: effective.name,
      alias: effective.alias || null,
      company: getCompanyNameSync(companyMap, effective.code),
      hierarchyKind: hierarchyKind(effective.hierarchyKind),
      level: effective.level,
      levelCode: organizationLevelCode(effective),
      levelLabel: organizationLevelLabel(effective),
      parentId: effective.parentId,
      parentName: department.parent?.name || null,
      managerPositionId: effective.managerPositionId,
      managerPositionName: department.managerPosition?.name ?? null,
      managerEmployeeIds: managers.map((manager) => manager.employeeId),
      managerEmployeeNames: managerNames,
      managerNames,
      managerName: managerNames.join("、") || null,
      isArchived: temporal.current === null,
      archivedAt: department.archivedAt?.toISOString() || null,
      version: department.version,
      asOfDate,
      temporal,
      headcount: department._count.edps,
      children: department.children.map((child) => ({ id: child.id, name: child.name })),
      descriptions: department.descriptions.map((description) => ({
        id: description.id,
        code: effective.code,
        name: effective.name,
        sourceFile: description.sourceFile,
        codeRaw: description.codeRaw,
        details: parseDetails(selectedDetails(description)),
      })),
    };
  });
  departments = departments.filter((department) => department.isArchived === Boolean(input.archived));
  if (input.keyword) departments = departments.filter((department) => matchAnyField(department, input.keyword, "Department"));

  const total = departments.length;
  const start = (input.page - 1) * input.pageSize;
  return { departments: departments.slice(start, start + input.pageSize), total, asOfDate, actionRuntimes };
}

export async function commitDepartmentCreateCommand(
  command: DepartmentCreateCommand,
  userId: number,
) {
  const { descriptions, lifecycle, ...departmentData } = command;
  const requestFingerprint = organizationRouteFingerprint("Department", "create", {
    departmentData,
    descriptions: descriptions ?? null,
    lifecycle,
  });
  try {
    const replay = await findDepartmentCommandReplay(lifecycle.idempotencyKey, requestFingerprint);
    if (replay) return serviceOk({ success: true, record: replay });
    const outcome = await runOrganizationStructureTransaction(async (tx) => {
      const previous = await tx.organizationStructureChange.findUnique({
        where: { idempotencyKey: lifecycle.idempotencyKey },
      });
      if (previous) {
        const replayId = assertDepartmentCommandReplay(previous, requestFingerprint);
        return { department: await tx.department.findUniqueOrThrow({ where: { id: replayId } }) };
      }
      const department = await createDepartmentWithInitialVersion(tx, departmentData, lifecycle, userId, requestFingerprint);
      const descriptionList = descriptions && descriptions.length > 0
        ? descriptions.map((d) => ({ ...d, departmentId: department.id }))
        : [{
            departmentId: department.id,
            sourceFile: "",
            details: "{}",
            editedBy: userId,
            editedAt: new Date(),
          }];
      const existingDescription = await tx.departmentDescription.findFirst({ where: { departmentId: department.id }, select: { id: true } });
      if (!existingDescription) {
        for (const descriptionData of descriptionList) {
          await tx.departmentDescription.create({ data: { ...descriptionData, editedBy: userId, editedAt: new Date() } });
        }
      }
      await snapshotHistory("Department", department.id, userId, tx);
      return { department };
    });
    return serviceOk({ success: true, record: outcome.department });
  } catch (error: unknown) {
    try {
      const replay = await findDepartmentCommandReplay(lifecycle.idempotencyKey, requestFingerprint);
      if (replay) return serviceOk({ success: true, record: replay });
    } catch (replayError) {
      if (replayError instanceof OrganizationStructureIdempotencyConflictError) {
        return serviceError(replayError.message, 409);
      }
      throw replayError;
    }
    if (error instanceof OrganizationStructureConcurrentUpdateError) return serviceError(error.message, 409);
    if (error instanceof OrganizationStructureIdempotencyConflictError) return serviceError(error.message, 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return serviceError("上级组织、负责人岗位或组织负责人不存在");
    }
    throw error;
  }
}

export async function commitDepartmentUpdateCommand(
  command: DepartmentUpdateCommand,
  userId: number,
) {
  const { id, descriptions, lifecycle } = command;
  const data: Prisma.DepartmentUncheckedUpdateInput = { ...command.data };
  const requestFingerprint = organizationRouteFingerprint("Department", "update", {
    id,
    data,
    descriptions: descriptions ?? null,
    lifecycle,
  });

  try {
    const replay = await findDepartmentCommandReplay(lifecycle.idempotencyKey, requestFingerprint, id);
    if (replay) return serviceOk({ success: true, department: replay });
  } catch (error) {
    if (error instanceof OrganizationStructureIdempotencyConflictError) return serviceError(error.message, 409);
    throw error;
  }

  let cascade: ReturnType<typeof deriveDepartmentCodeCascade> | null = null;
  if (data.code !== undefined) {
    const existing = await prisma.department.findUnique({
      where: { id },
      select: { code: true, hierarchyKind: true, level: true },
    });
    if (existing && data.code !== existing.code) {
      const [allDepartments, allPositions] = await Promise.all([
        prisma.department.findMany({ select: { id: true, code: true, hierarchyKind: true, level: true, parentId: true } }),
        prisma.position.findMany({ select: { id: true, code: true, departmentId: true } }),
      ]);
      if (hierarchyKind(existing.hierarchyKind) === "M") {
        cascade = deriveDepartmentCodeCascade({
          changedDepartment: { id, code: existing.code, level: existing.level, parentId: null },
          newCode: String(data.code),
          departments: allDepartments.filter((department) => hierarchyKind(department.hierarchyKind) === "M"),
          positions: allPositions,
        });
      } else {
        cascade = {
          departments: [],
          positions: allPositions
            .filter((position) => position.departmentId === id)
            .map((position) => {
              const suffix = String(position.code || "").trim().split("-").pop() || "";
              return /^\d{1,2}$/.test(suffix) ? { id: position.id, code: `GW-${String(data.code)}-${suffix.padStart(2, "0")}` } : { id: position.id, code: position.code };
            })
            .filter((position) => allPositions.find((item) => item.id === position.id)?.code !== position.code),
        };
      }
    }
  }

  try {
    const outcome = await runOrganizationStructureTransaction(async (tx) => {
      const previous = await tx.organizationStructureChange.findUnique({
        where: { idempotencyKey: lifecycle.idempotencyKey },
      });
      if (previous) {
        assertDepartmentCommandReplay(previous, requestFingerprint, id);
        return { department: await tx.department.findUniqueOrThrow({ where: { id } }) };
      }
      const existing = await tx.department.findUnique({ where: { id } });
      if (!existing) throw new Error("组织不存在");
      const department = await applyDepartmentStructureChange(tx, {
        departmentId: id,
        payload: mergeDepartmentPayload(existing, data),
        meta: lifecycle,
        userId,
        requestFingerprint,
      });
      if (cascade) {
        for (const { id: deptId, code } of cascade.departments) {
          if (deptId === id) continue;
          const child = await tx.department.findUnique({ where: { id: deptId } });
          if (!child) continue;
          await applyDepartmentStructureChange(tx, {
            departmentId: deptId,
            payload: { ...departmentPayload(child), code },
            meta: {
              ...lifecycle,
              expectedSequence: child.version,
              idempotencyKey: `${lifecycle.idempotencyKey}:department:${deptId}`,
            },
            userId,
          });
        }
        for (const { id: posId, code } of cascade.positions) {
          const position = await tx.position.findUnique({ where: { id: posId } });
          if (!position) continue;
          await applyPositionStructureChange(tx, {
            positionId: posId,
            payload: { ...positionPayload(position), code },
            meta: {
              ...lifecycle,
              expectedSequence: position.version,
              idempotencyKey: `${lifecycle.idempotencyKey}:position:${posId}`,
            },
            userId,
          });
        }
      }
      if (descriptions) {
        for (const descriptionData of descriptions) {
          if (descriptionData.id) {
            await tx.departmentDescription.update({
              where: { id: descriptionData.id },
              data: { ...descriptionData, editedBy: userId, editedAt: new Date() },
            });
          } else {
            await tx.departmentDescription.create({
              data: { ...descriptionData, departmentId: id, editedBy: userId, editedAt: new Date() },
            });
          }
        }
      }
      await snapshotHistory("Department", id, userId, tx);
      return { department };
    });
    return serviceOk({ success: true, department: outcome.department });
  } catch (error: unknown) {
    try {
      const replay = await findDepartmentCommandReplay(lifecycle.idempotencyKey, requestFingerprint, id);
      if (replay) return serviceOk({ success: true, department: replay });
    } catch (replayError) {
      if (replayError instanceof OrganizationStructureIdempotencyConflictError) {
        return serviceError(replayError.message, 409);
      }
      throw replayError;
    }
    if (error instanceof OrganizationStructureConcurrentUpdateError) return serviceError(error.message, 409);
    if (error instanceof OrganizationStructureIdempotencyConflictError) return serviceError(error.message, 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return serviceError("编码已存在", 409);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return serviceError("组织不存在", 404);
    }
    throw error;
  }
}

async function findDepartmentCommandReplay(
  idempotencyKey: string,
  requestFingerprint: string,
  departmentId?: number,
) {
  const previous = await prisma.organizationStructureChange.findUnique({ where: { idempotencyKey } });
  if (!previous) return null;
  const replayId = assertDepartmentCommandReplay(previous, requestFingerprint, departmentId);
  return prisma.department.findUniqueOrThrow({ where: { id: replayId } });
}

function assertDepartmentCommandReplay(
  previous: { aggregateType: string; aggregateId: number; requestFingerprint: string },
  requestFingerprint: string,
  departmentId?: number,
) {
  const mismatch = previous.aggregateType !== "Department"
    || (departmentId !== undefined && previous.aggregateId !== departmentId)
    || !businessTemporalIdempotencyMatches(previous.requestFingerprint, requestFingerprint);
  if (mismatch) throw new OrganizationStructureIdempotencyConflictError();
  return previous.aggregateId;
}
function organizationRouteFingerprint(aggregate: string, commandKind: string, value: Record<string, unknown>) {
  const lifecycle = value.lifecycle && typeof value.lifecycle === "object"
    ? Object.fromEntries(Object.entries(value.lifecycle as Record<string, unknown>).filter(([key]) => key !== "idempotencyKey"))
    : value.lifecycle;
  return businessTemporalRequestFingerprint({ aggregate, commandKind, request: { ...value, lifecycle } });
}

function departmentPayload(department: {
  code: string;
  name: string;
  alias: string | null;
  hierarchyKind: string;
  level: number;
  parentId: number | null;
  managerPositionId: number | null;
}): DepartmentStructurePayload {
  return {
    code: department.code,
    name: department.name,
    alias: department.alias,
    hierarchyKind: department.hierarchyKind,
    level: department.level,
    parentId: department.parentId,
    managerPositionId: department.managerPositionId,
  };
}

function mergeDepartmentPayload(
  department: Parameters<typeof departmentPayload>[0],
  data: Prisma.DepartmentUncheckedUpdateInput,
): DepartmentStructurePayload {
  const raw = data as Record<string, unknown>;
  const current = departmentPayload(department);
  return {
    code: typeof raw.code === "string" ? raw.code : current.code,
    name: typeof raw.name === "string" ? raw.name : current.name,
    alias: raw.alias === null || typeof raw.alias === "string" ? raw.alias : current.alias,
    hierarchyKind: typeof raw.hierarchyKind === "string" ? raw.hierarchyKind : current.hierarchyKind,
    level: typeof raw.level === "number" ? raw.level : current.level,
    parentId: raw.parentId === null || typeof raw.parentId === "number" ? raw.parentId : current.parentId,
    managerPositionId: raw.managerPositionId === null || typeof raw.managerPositionId === "number" ? raw.managerPositionId : current.managerPositionId,
  };
}

function positionPayload(position: {
  code: string;
  name: string;
  alias: string | null;
  departmentId: number | null;
  reportToPositionId: number | null;
}): PositionStructurePayload {
  return {
    code: position.code,
    name: position.name,
    alias: position.alias,
    departmentId: position.departmentId,
    reportToPositionId: position.reportToPositionId,
  };
}

function temporalView<TPayload, TSource extends { id: number; changeKind: string; sourceChange: { reason: string | null; recordedAt: Date; actorUserId: number } }>(
  timeline: ReturnType<typeof organizationTimeline<TPayload>>,
  sources: readonly TSource[],
) {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const items = timeline.map((item) => {
    const source = sourceById.get(item.id);
    return {
      ...item,
      changeKind: source?.changeKind ?? "unknown",
      reason: source?.sourceChange.reason ?? null,
      recordedAt: source?.sourceChange.recordedAt.toISOString() ?? null,
      recordedBy: source?.sourceChange.actorUserId ?? null,
    };
  });
  return {
    current: items.find((item) => item.isLive && item.temporalState === "current") ?? null,
    upcoming: items.filter((item) => item.isLive && item.temporalState === "upcoming"),
    history: items.filter((item) => !item.isLive || item.temporalState === "past"),
  };
}

export async function updateDepartment(
  input: DepartmentUpdateInput,
  userId: number,
  authorization?: DepartmentMutationAuthorization,
) {
  if (authorization !== "lifecycle") {
    return serviceError("组织更新必须通过 ActionContract command 执行", 500);
  }
  const command = mapValidationToServiceResult(await buildDepartmentUpdateCommand(input));
  if (!command.ok) return command;
  return commitDepartmentUpdateCommand(command.data, userId);
}

export async function deleteDepartment(command: CrudDeleteCommand) {
  const validation = await validateDepartmentDelete(command.id, "终止组织");
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  return serviceError("组织不允许硬删除，请使用带生效日和原因的 end-date 命令", 409);
}
