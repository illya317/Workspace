import { prisma, Prisma } from "@workspace/platform/server/prisma";

export type HrContributionRole = "owner" | "participant";

export type HrContributionRow = {
  id: string;
  employeeId: number;
  employeeName: string;
  sourceKind: "work_item";
  contributionType: string;
  contributionRole: HrContributionRole;
  roleLabel: string;
  sourceSpace: string;
  title: string;
  relation: string;
  status: string;
  actualEndDate: string | null;
  evidenceCount: number;
  referenceLabel: string;
};

type HrPerformanceCycleWindow = {
  id: number;
  startDate: Date;
  endDate: Date;
};

const contributionWorkItemInclude = {
  owner: { select: { id: true, employeeId: true, name: true } },
  plan: { select: { id: true, title: true, kind: true, okrStage: true, status: true, targetType: true, targetId: true } },
  parentWorkItem: {
    select: {
      id: true,
      content: true,
      itemType: true,
      parentWorkItem: { select: { id: true, content: true, itemType: true } },
    },
  },
  linkedProject: { select: { id: true, code: true, name: true } },
  linkedProjectPhase: { select: { id: true, name: true } },
  sourceMeeting: { select: { id: true, title: true } },
  sourceMeetingDecision: { select: { id: true, title: true } },
  sourceMeetingActionCandidate: { select: { id: true, title: true } },
  sourceDepartment: { select: { id: true, code: true, name: true } },
  participants: true,
  _count: { select: { krEvidenceTasks: true, taskEvidenceForKrs: true, reportItems: true } },
} satisfies Prisma.WorkItemInclude;

type ContributionWorkItem = Prisma.WorkItemGetPayload<{ include: typeof contributionWorkItemInclude }>;

export async function buildEmployeeContributionSnapshot(employeeId: number, okrCycleId: number): Promise<HrContributionRow[]> {
  const [employee, cycle] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, name: true } }),
    prisma.workOkrCycle.findUnique({ where: { id: okrCycleId }, select: { id: true, startDate: true, endDate: true } }),
  ]);
  if (!employee || !cycle) return [];
  return listEmployeeContributionRows({
    employeeIds: [employee.id],
    cycle,
    employeeNameById: new Map([[employee.id, employee.name]]),
  });
}

export async function listEmployeeContributionRows(input: {
  employeeIds: number[];
  cycle: HrPerformanceCycleWindow;
  employeeNameById: ReadonlyMap<number, string>;
}): Promise<HrContributionRow[]> {
  const employeeIds = Array.from(new Set(input.employeeIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (employeeIds.length === 0) return [];
  const employeeIdSet = new Set(employeeIds);
  const uniqueParticipantNameToEmployeeId = uniqueNameToEmployeeId(input.employeeNameById, employeeIdSet);
  const participantNames = Array.from(uniqueParticipantNameToEmployeeId.keys());
  const workItems = await prisma.workItem.findMany({
    where: {
      AND: [
        { isArchived: false, targetType: { in: ["company", "committee", "department", "personal"] } },
        {
          OR: [
            { ownerEmployeeId: { in: employeeIds } },
            ...(participantNames.length > 0 ? [{ participants: { some: { name: { in: participantNames } } } }] : []),
          ],
        },
        workItemCycleWhere(input.cycle),
      ],
    },
    include: contributionWorkItemInclude,
    orderBy: [{ targetType: "asc" }, { targetId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
  const departmentNameById = await loadTargetDepartmentNames(workItems);
  return workItems.flatMap((item) => workItemContributionRows(item, {
    employeeIdSet,
    employeeNameById: input.employeeNameById,
    participantNameToEmployeeId: uniqueParticipantNameToEmployeeId,
    departmentNameById,
  })).sort(sortContributionRows);
}

function workItemCycleWhere(cycle: HrPerformanceCycleWindow): Prisma.WorkItemWhereInput {
  return {
    OR: [
      { plan: { okrCycleId: cycle.id, status: { notIn: ["closed", "archived"] } } },
      {
        AND: [
          { planId: null },
          { periodStart: { lte: cycle.endDate } },
          { periodEnd: { gte: cycle.startDate } },
        ],
      },
      {
        AND: [
          { planId: { not: null } },
          { plan: { okrCycleId: null, status: { notIn: ["closed", "archived"] } } },
          { periodStart: { lte: cycle.endDate } },
          { periodEnd: { gte: cycle.startDate } },
        ],
      },
    ],
  };
}

function uniqueNameToEmployeeId(employeeNameById: ReadonlyMap<number, string>, allowedEmployeeIds: ReadonlySet<number>) {
  const firstSeen = new Map<string, number>();
  const duplicates = new Set<string>();
  for (const [employeeId, name] of employeeNameById) {
    const normalized = name.trim();
    if (!allowedEmployeeIds.has(employeeId) || !normalized) continue;
    if (firstSeen.has(normalized)) duplicates.add(normalized);
    else firstSeen.set(normalized, employeeId);
  }
  for (const name of duplicates) firstSeen.delete(name);
  return firstSeen;
}

async function loadTargetDepartmentNames(workItems: ContributionWorkItem[]) {
  const departmentIds = Array.from(new Set(workItems
    .map<number | null>((item) => item.targetType === "department" ? item.targetId : null)
    .filter((id): id is number => id !== null && Number.isInteger(id) && id > 0)));
  if (departmentIds.length === 0) return new Map<number, string>();
  const departments = await prisma.department.findMany({
    where: { id: { in: departmentIds } },
    select: { id: true, code: true, name: true },
  });
  return new Map(departments.map((department) => [department.id, [department.name, department.code].filter(Boolean).join(" / ")]));
}

function workItemContributionRows(item: ContributionWorkItem, context: {
  employeeIdSet: ReadonlySet<number>;
  employeeNameById: ReadonlyMap<number, string>;
  participantNameToEmployeeId: ReadonlyMap<string, number>;
  departmentNameById: ReadonlyMap<number, string>;
}): HrContributionRow[] {
  const rows: HrContributionRow[] = [];
  if (item.ownerEmployeeId && context.employeeIdSet.has(item.ownerEmployeeId)) {
    rows.push(workItemContributionRow(item, item.ownerEmployeeId, context.employeeNameById, context.departmentNameById, "owner"));
  }
  for (const participant of item.participants) {
    const employeeId = context.participantNameToEmployeeId.get(participant.name.trim());
    if (!employeeId || employeeId === item.ownerEmployeeId) continue;
    rows.push(workItemContributionRow(item, employeeId, context.employeeNameById, context.departmentNameById, "participant"));
  }
  return rows;
}

function workItemContributionRow(
  item: ContributionWorkItem,
  employeeId: number,
  employeeNameById: ReadonlyMap<number, string>,
  departmentNameById: ReadonlyMap<number, string>,
  contributionRole: Extract<HrContributionRole, "owner" | "participant">,
): HrContributionRow {
  return {
    id: `work:${item.id}:${employeeId}:${contributionRole}`,
    employeeId,
    employeeName: employeeNameById.get(employeeId) || item.owner?.name || "",
    sourceKind: "work_item",
    contributionType: workItemTypeLabel(item.itemType),
    contributionRole,
    roleLabel: contributionRole === "owner" ? "Owner" : "参与",
    sourceSpace: workSpaceLabel(item.targetType, item.targetId, departmentNameById),
    title: item.content,
    relation: workItemRelationLabel(item),
    status: workItemStatusLabel(item.status),
    actualEndDate: formatDate(item.actualEndDate),
    evidenceCount: workItemEvidenceCount(item),
    referenceLabel: workItemReferenceLabel(item),
  };
}

function workSpaceLabel(targetType: string | null, targetId: number | null, departmentNameById: ReadonlyMap<number, string>) {
  if (targetType === "personal") return "个人空间";
  if (targetType === "company") return "公司空间";
  if (targetType === "committee") return "委员会";
  if (targetType === "department") return targetId ? departmentNameById.get(targetId) || `部门 #${targetId}` : "部门空间";
  return "工作空间";
}

function workItemRelationLabel(item: ContributionWorkItem) {
  return compactJoin([
    item.parentWorkItem?.parentWorkItem?.content,
    item.parentWorkItem?.content,
    item.plan?.title,
  ], " / ");
}

function workItemReferenceLabel(item: ContributionWorkItem) {
  return compactJoin([
    item.linkedProject?.name,
    item.linkedProjectPhase?.name,
    item.sourceMeeting?.title,
    item.sourceMeetingDecision?.title,
    item.sourceMeetingActionCandidate?.title,
    item.sourceDepartment?.name,
  ], " / ");
}

function workItemEvidenceCount(item: ContributionWorkItem) {
  const explicitEvidence = item._count.krEvidenceTasks + item._count.taskEvidenceForKrs + item._count.reportItems;
  const referenceEvidence = [
    item.linkedProjectId,
    item.linkedProjectPhaseId,
    item.sourceMeetingId,
    item.sourceMeetingDecisionId,
    item.sourceMeetingActionCandidateId,
  ].filter(Boolean).length;
  return explicitEvidence + referenceEvidence;
}

function workItemTypeLabel(itemType: string) {
  if (itemType === "objective") return "目标";
  if (itemType === "key_result") return "KR";
  return "工作项";
}

function workItemStatusLabel(status: string | null) {
  if (status === "done") return "已完成";
  if (status === "paused") return "已暂停";
  if (status === "archived") return "已归档";
  return "进行中";
}

function compactJoin(values: Array<string | null | undefined>, separator = " · ") {
  return values.map((value) => String(value || "").trim()).filter(Boolean).join(separator);
}

function sortContributionRows(a: HrContributionRow, b: HrContributionRow) {
  return a.employeeName.localeCompare(b.employeeName, "zh-Hans-CN")
    || String(a.actualEndDate || "9999-12-31").localeCompare(String(b.actualEndDate || "9999-12-31"))
    || a.sourceKind.localeCompare(b.sourceKind)
    || a.title.localeCompare(b.title, "zh-Hans-CN");
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}
