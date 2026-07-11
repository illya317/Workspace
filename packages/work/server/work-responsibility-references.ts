import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { serviceError, serviceOk, type ServiceResult } from "@workspace/platform/server/api";
import { matchesFkKeyword, type FkOption } from "@workspace/platform/server/fk-registry";
import { validateWorkResponsibilityReferenceReplaceCommand } from "./domain/work-responsibility-reference-validation";
import { workOwnerDepartmentScopeIds } from "./work-owner-scopes";

export type WorkResponsibilityReferenceTarget = {
  targetKind: "work_item";
  workItemId: number;
  referenceRole: "execution";
};

export type WorkResponsibilityOption = FkOption & {
  lockedEmployeeId: number;
  lockedEmployeeName: string;
  lockedEmployeeNumber: string | null;
  lockedPositionId: number | null;
  lockedPositionName: string | null;
  positionDescriptionId: number;
  nodeType: string;
  pathLabel: string;
  groupKey?: string | null;
  groupLabel?: string | null;
};

export const workResponsibilityReferenceSummarySelect = {
  id: true,
  responsibilityNodeId: true,
  lockedEmployeeId: true,
  lockedPositionId: true,
  snapshotJson: true,
  pathLabelSnapshot: true,
  titleSnapshot: true,
  contentSnapshot: true,
} satisfies Prisma.WorkResponsibilityReferenceSelect;

export type WorkResponsibilityReferenceSummaryRow = Prisma.WorkResponsibilityReferenceGetPayload<{
  select: typeof workResponsibilityReferenceSummarySelect;
}>;

export function summarizeWorkResponsibilityReference(
  references?: WorkResponsibilityReferenceSummaryRow[] | null,
) {
  const reference = references?.[0] ?? null;
  if (!reference) {
    return {
      responsibilityReferenceId: null,
      responsibilityNodeId: null,
      responsibilityLabel: null,
      responsibilityPathLabel: null,
      responsibilityTitle: null,
      responsibilityContent: null,
      responsibilityLockedEmployeeId: null,
      responsibilityPositionId: null,
      responsibilityPositionName: null,
    };
  }
  const snapshot = parseResponsibilitySnapshot(reference.snapshotJson);
  return {
    responsibilityReferenceId: reference.id,
    responsibilityNodeId: reference.responsibilityNodeId,
    responsibilityLabel: formatResponsibilityLabel(reference.pathLabelSnapshot, reference.titleSnapshot || reference.contentSnapshot),
    responsibilityPathLabel: reference.pathLabelSnapshot || null,
    responsibilityTitle: reference.titleSnapshot || null,
    responsibilityContent: reference.contentSnapshot || null,
    responsibilityLockedEmployeeId: reference.lockedEmployeeId,
    responsibilityPositionId: reference.lockedPositionId,
    responsibilityPositionName: snapshot.position?.name ?? null,
  };
}

function parseResponsibilitySnapshot(value: string | null | undefined): { position?: { name?: string | null } | null } {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as { position?: { name?: string | null } | null };
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function validateWorkResponsibilitySelection(input: {
  responsibilityNodeId?: number | null;
  ownerEmployeeId?: number | null;
  positionId?: number | null;
  required: boolean;
  expectedNodeType: "duty_group" | "duty_item";
  label: string;
}) {
  const nodeId = normalizeNullablePositiveId(input.responsibilityNodeId);
  const ownerEmployeeId = normalizeNullablePositiveId(input.ownerEmployeeId);
  const positionId = normalizeNullablePositiveId(input.positionId);
  if (!nodeId) return input.required ? `${input.label}必须选择关联职责` : null;
  if (!ownerEmployeeId) return "关联职责必须锁定负责人";
  const resolved = await resolveResponsibilityNodeForOwner(nodeId, ownerEmployeeId, prisma, positionId);
  if (!resolved) return "关联职责不存在或不属于所选负责人";
  if (resolved.node.nodeType !== input.expectedNodeType) return input.expectedNodeType === "duty_group" ? `${input.label}必须关联职责大类` : `${input.label}必须关联职责小项`;
  if (ownerEmployeeId && resolved.employee.id !== ownerEmployeeId) return "关联职责锁定员工与负责人不一致";
  return null;
}

export async function listWorkResponsibilityReferenceOptions(input: {
  keyword: string;
  nodeType: "duty_group" | "duty_item";
  targetType?: string | null;
  targetId?: number | null;
  ownerEmployeeId?: number | null;
  positionId?: number | null;
}) {
  const employeeIds = await resolveResponsibilityEmployeeIds(input);
  if (employeeIds.length === 0) return [];
  const today = new Date().toISOString().slice(0, 10);
  const targetId = normalizeNullablePositiveId(input.targetId);
  const departmentScopeIds = await workOwnerDepartmentScopeIds(input.targetType, targetId);
  const positionId = normalizeNullablePositiveId(input.positionId);
  const rows = await prisma.eDP.findMany({
    where: {
      employeeId: { in: employeeIds },
      ...(departmentScopeIds.length > 0 ? { departmentId: { in: departmentScopeIds } } : {}),
      positionId: positionId ?? { not: null },
      OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: today } }],
      position: { isArchived: false, positionDescriptionId: { not: null } },
    },
    select: {
      id: true,
      isPrimary: true,
      employee: { select: { id: true, employeeId: true, name: true } },
      department: { select: { id: true, code: true, name: true } },
      position: {
        select: {
          id: true,
          code: true,
          name: true,
          positionDescription: {
            select: {
              responsibilityNodes: {
                where: { nodeType: input.nodeType, isActive: true },
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  pathLabel: true,
                  title: true,
                  content: true,
                  positionDescriptionId: true,
                  nodeType: true,
                  parent: { select: { nodeKey: true, pathLabel: true, title: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ isPrimary: "desc" }, { employeeId: "asc" }, { id: "asc" }],
  });
  const options: WorkResponsibilityOption[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.position) continue;
    for (const node of row.position.positionDescription?.responsibilityNodes ?? []) {
      const key = `${row.employee.id}:${node.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const name = formatResponsibilityLabel(node.pathLabel, node.title || node.content);
      const subtitle = [row.employee.name, row.department?.name].filter(Boolean).join(" · ");
      if (!matchesFkKeyword([name, subtitle, row.employee.employeeId, row.position.code], input.keyword)) continue;
      options.push({
        id: node.id,
        name,
        subtitle,
        departmentId: row.department?.id ?? null,
        departmentPath: row.department?.name ?? null,
        lifecycleStatus: "active",
        lockedEmployeeId: row.employee.id,
        lockedEmployeeName: row.employee.name,
        lockedEmployeeNumber: row.employee.employeeId,
        lockedPositionId: row.position.id,
        lockedPositionName: row.position.name,
        positionDescriptionId: node.positionDescriptionId,
        nodeType: node.nodeType,
        pathLabel: node.pathLabel,
        groupKey: input.nodeType === "duty_group" ? "duty-groups" : node.parent?.nodeKey ?? null,
        groupLabel: input.nodeType === "duty_group"
          ? "职责大类"
          : formatResponsibilityLabel(node.parent?.pathLabel, node.parent?.title) || null,
      });
    }
  }
  return options.slice(0, 50);
}

export async function resolveWorkResponsibilityReferenceOption(id: number) {
  const node = await prisma.positionResponsibilityNode.findUnique({
    where: { id },
    select: { id: true, isActive: true, pathLabel: true, title: true, content: true },
  });
  if (!node) return null;
  return {
    id: node.id,
    label: formatResponsibilityLabel(node.pathLabel, node.title || node.content),
    lifecycleStatus: node.isActive ? "active" as const : "inactive" as const,
  };
}

export async function replaceWorkResponsibilityReference(
  tx: Prisma.TransactionClient,
  target: WorkResponsibilityReferenceTarget,
  input: {
    responsibilityNodeId?: number | null;
    ownerEmployeeId?: number | null;
    positionId?: number | null;
  },
) {
  const command = validateWorkResponsibilityReferenceReplaceCommand({ ...target, ...input });
  if (!command.ok) throw new Error(command.issue.message);
  await tx.workResponsibilityReference.deleteMany({
    where: { workItemId: target.workItemId, referenceRole: target.referenceRole },
  });
  if (!command.data.responsibilityNodeId) return;

  const snapshot = await buildWorkResponsibilityReferenceSnapshot(command.data, tx);
  if (!snapshot.ok) throw new Error(snapshot.error);
  await tx.workResponsibilityReference.create({ data: snapshot.data });
}

export async function createWorkResponsibilityReference(input: {
  targetKind: "work_item";
  referenceRole: "execution";
  workItemId?: number | null;
  responsibilityNodeId?: number | null;
  ownerEmployeeId?: number | null;
  positionId?: number | null;
}): Promise<ServiceResult<{ responsibilityReference: unknown }>> {
  const command = validateWorkResponsibilityReferenceReplaceCommand(input);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  if (!command.data.responsibilityNodeId) return serviceError("必须选择关联职责", 400);
  const snapshot = await buildWorkResponsibilityReferenceSnapshot(command.data, prisma);
  if (!snapshot.ok) return snapshot;
  const responsibilityReference = await prisma.workResponsibilityReference.create({ data: snapshot.data });
  return serviceOk({ responsibilityReference });
}

async function buildWorkResponsibilityReferenceSnapshot(
  input: {
    targetKind: "work_item";
    referenceRole: "execution";
    workItemId: number;
    responsibilityNodeId: number | null;
    ownerEmployeeId: number | null;
    positionId: number | null;
  },
  tx: Prisma.TransactionClient | typeof prisma,
): Promise<ServiceResult<Prisma.WorkResponsibilityReferenceUncheckedCreateInput>> {
  if (!input.responsibilityNodeId || !input.ownerEmployeeId) return serviceError("职责引用必须锁定员工和职责条目", 400);
  const node = await tx.positionResponsibilityNode.findUnique({
    where: { id: input.responsibilityNodeId },
    select: {
      id: true,
      isActive: true,
      positionDescriptionId: true,
      nodeKey: true,
      nodeType: true,
      pathLabel: true,
      title: true,
      content: true,
      descriptionVersion: true,
      descriptionUpdatedAt: true,
      parent: { select: { nodeKey: true, title: true, pathLabel: true } },
    },
  });
  if (!node || !node.isActive) return serviceError("职责条目不存在或已停用", 404);

  const ownerContext = await resolveResponsibilityNodeForOwner(node.id, input.ownerEmployeeId, tx, input.positionId);
  if (!ownerContext) return serviceError("负责人当前任职不属于该职责条目", 400);

  return serviceOk({
    targetKind: input.targetKind,
    referenceRole: input.referenceRole,
    workItemId: input.workItemId,
    responsibilityNodeId: node.id,
    lockedEmployeeId: ownerContext.employee.id,
    lockedPositionId: ownerContext.position.id,
    lockedEmployeePositionId: ownerContext.edp.id,
    positionDescriptionId: node.positionDescriptionId,
    positionDescriptionVersionSnapshot: node.descriptionVersion,
    positionDescriptionUpdatedAtSnapshot: node.descriptionUpdatedAt,
    nodeKeySnapshot: node.nodeKey,
    nodeTypeSnapshot: node.nodeType,
    parentNodeKeySnapshot: node.parent?.nodeKey ?? null,
    pathLabelSnapshot: node.pathLabel,
    titleSnapshot: node.title,
    contentSnapshot: node.content,
    snapshotJson: JSON.stringify({
      employee: ownerContext.employee,
      position: ownerContext.position,
      department: ownerContext.department,
      responsibility: {
        nodeKey: node.nodeKey,
        nodeType: node.nodeType,
        pathLabel: node.pathLabel,
        title: node.title,
        content: node.content,
        parentNodeKey: node.parent?.nodeKey ?? null,
        parentTitle: node.parent?.title ?? null,
        parentPathLabel: node.parent?.pathLabel ?? null,
      },
    }),
  });
}

async function resolveResponsibilityOwnerContext(input: {
  tx: Prisma.TransactionClient | typeof prisma;
  ownerEmployeeId: number;
  positionDescriptionId: number;
  positionId?: number | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const edp = await input.tx.eDP.findFirst({
    where: {
      employeeId: input.ownerEmployeeId,
      ...(input.positionId ? { positionId: input.positionId } : {}),
      position: { positionDescriptionId: input.positionDescriptionId },
      OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: today } }],
    },
    orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
    select: {
      id: true,
      employee: { select: { id: true, employeeId: true, name: true } },
      department: { select: { id: true, code: true, name: true } },
      position: { select: { id: true, code: true, name: true } },
    },
  });
  if (!edp?.position) return null;
  return {
    node: { id: 0, nodeType: "", positionDescriptionId: input.positionDescriptionId },
    edp: { id: edp.id },
    employee: edp.employee,
    department: edp.department,
    position: edp.position,
  };
}

async function resolveResponsibilityEmployeeIds(input: {
  targetType?: string | null;
  targetId?: number | null;
  ownerEmployeeId?: number | null;
}) {
  const ownerEmployeeId = normalizeNullablePositiveId(input.ownerEmployeeId);
  if (ownerEmployeeId) return [ownerEmployeeId];
  const targetId = normalizeNullablePositiveId(input.targetId);
  if (!targetId) return [];
  if (input.targetType === "personal") {
    const rows = await prisma.employee.findMany({ where: { userId: targetId }, select: { id: true } });
    return rows.map((row) => row.id);
  }
  if (input.targetType === "department" || input.targetType === "committee") {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await prisma.eDP.findMany({
      where: { departmentId: targetId, OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: today } }] },
      select: { employeeId: true },
      distinct: ["employeeId"],
    });
    return rows.map((row) => row.employeeId);
  }
  if (input.targetType === "project") {
    const rows = await prisma.employeeProject.findMany({ where: { projectId: targetId }, select: { employeeId: true }, distinct: ["employeeId"] });
    return rows.map((row) => row.employeeId);
  }
  return [];
}

async function resolveResponsibilityNodeForOwner(
  nodeId: number,
  ownerEmployeeId: number | null | undefined,
  tx: Prisma.TransactionClient | typeof prisma,
  positionId?: number | null,
) {
  const node = await tx.positionResponsibilityNode.findUnique({
    where: { id: nodeId },
    select: { id: true, positionDescriptionId: true, nodeType: true },
  });
  if (!node) return null;
  const owner = normalizeNullablePositiveId(ownerEmployeeId);
  if (!owner) return null;
  const context = await resolveResponsibilityOwnerContext({ tx, ownerEmployeeId: owner, positionDescriptionId: node.positionDescriptionId, positionId });
  return context ? { ...context, node } : null;
}

function normalizeNullablePositiveId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function formatResponsibilityLabel(pathLabel: string | null | undefined, title: string | null | undefined) {
  return [pathLabel, title].filter(Boolean).join(" ");
}
