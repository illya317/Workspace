export type ProjectGanttZoom = "year" | "quarter" | "month";

export type ProjectGanttProject = {
  id: number;
  name: string;
  status: string | null;
  projectLevel: string | null;
  leadingDepartmentId: number | null;
  leadingDepartmentCode: string | null;
  leadingDepartmentName: string | null;
  leaderNames: string[];
  stages: ProjectGanttStage[];
  startDate: string | null;
  endDate: string | null;
  completionPercent: number | null;
  baselineStartDate: string | null;
  baselineEndDate: string | null;
};

export type ProjectGanttStage = {
  id: number;
  sequenceNo: number;
  stage: string;
  startDate: string | null;
  note: string | null;
};

export type ProjectGanttStageSegment = ProjectGanttStage & {
  endDate: string | null;
};

export type ProjectGanttTask = {
  id: number;
  projectId: number;
  name: string;
  description: string;
  isMilestone: boolean;
  startDate: string | null;
  endDate: string | null;
  baselineStartDate: string | null;
  baselineEndDate: string | null;
  sortOrder: number;
  ownerEmployeeName: string | null;
};

export type ProjectGanttData = {
  projects: ProjectGanttProject[];
  tasks: ProjectGanttTask[];
};

export type GanttNodeKind = "project" | "task";

export type GanttMilestoneEvent = {
  key: string;
  name: string;
  date: string;
};

type GanttNode = {
  key: string;
  kind: GanttNodeKind;
  name: string;
  parentKey: string | null;
  status: string | null;
  projectLevel: string | null;
  isMilestone: boolean;
  ownerNames: string[];
  stages: ProjectGanttStageSegment[];
  milestoneEvents: GanttMilestoneEvent[];
  startDate: string | null;
  endDate: string | null;
  baselineStartDate: string | null;
  baselineEndDate: string | null;
  searchText: string;
  projectKey?: string;
  aggregateStart?: string | null;
  aggregateEnd?: string | null;
};

export type GanttRow = GanttNode & {
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
};

export type ProjectGanttLevelFilter = "all" | "普通" | "重点";
export const PROJECT_GANTT_LEVEL_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "普通", label: "普通" },
  { value: "重点", label: "重点" },
] as const;

export const PROJECT_GANTT_ZOOM_OPTIONS = [
  { value: "year", label: "年" },
  { value: "quarter", label: "季度" },
  { value: "month", label: "月" },
];

export const PROJECT_GANTT_TASK_OPTIONS = [
  { value: "0", label: "概览" },
  { value: "1", label: "明细" },
];

export function projectKey(id: number) {
  return `project:${id}`;
}

export function taskKey(id: number) {
  return `task:${id}`;
}

export function defaultGanttExpandedKeys(data: ProjectGanttData) {
  void data;
  return new Set<string>();
}

export function buildProjectGanttRows(input: {
  data: ProjectGanttData;
  expandedKeys: Set<string>;
  keyword: string;
  level: ProjectGanttLevelFilter;
}) {
  const nodes = new Map<string, GanttNode>();
  const children = new Map<string, string[]>();
  const projectFilterPass = new Map<string, boolean>();
  const keyword = input.keyword.trim().toLowerCase();
  const levelFiltered = input.level !== "all";

  function addNode(node: GanttNode) {
    nodes.set(node.key, node);
    if (!node.parentKey) return;
    const list = children.get(node.parentKey) || [];
    list.push(node.key);
    children.set(node.parentKey, list);
  }

  for (const project of input.data.projects) {
    const key = projectKey(project.id);
    const passesLevel = !levelFiltered || project.projectLevel === input.level;
    const passes = passesLevel;
    projectFilterPass.set(key, passes);
    addNode({
      key,
      kind: "project",
      name: project.name,
      parentKey: null,
      status: project.status,
      projectLevel: project.projectLevel,
      isMilestone: true,
      ownerNames: project.leaderNames,
      stages: [],
      milestoneEvents: project.endDate && (project.status === "已完成" || project.status === "已终止")
        ? [{ key: `project-milestone:${project.id}`, name: `${project.name} ${project.status}`, date: project.endDate }]
        : [],
      startDate: project.startDate,
      endDate: project.endDate,
      baselineStartDate: project.baselineStartDate,
      baselineEndDate: project.baselineEndDate,
      searchText: [project.name, project.status, project.projectLevel, project.leadingDepartmentName, ...project.leaderNames].filter(Boolean).join(" "),
      projectKey: key,
    });
  }

  for (const task of input.data.tasks) {
    const parentKey = projectKey(task.projectId);
    if (!nodes.has(parentKey)) continue;
    addNode({
      key: taskKey(task.id),
      kind: "task",
      name: task.name || task.description,
      parentKey,
      status: null,
      projectLevel: null,
      isMilestone: task.isMilestone,
      ownerNames: task.ownerEmployeeName ? [task.ownerEmployeeName] : [],
      stages: [],
      milestoneEvents: task.isMilestone && (task.endDate || task.startDate)
        ? [{ key: `task-milestone:${task.id}`, name: task.name || task.description, date: task.endDate || task.startDate || "" }]
        : [],
      startDate: task.startDate,
      endDate: task.endDate,
      baselineStartDate: task.baselineStartDate,
      baselineEndDate: task.baselineEndDate,
      searchText: [task.name, task.description, task.ownerEmployeeName].filter(Boolean).join(" "),
      projectKey: parentKey,
    });
  }

  const filterActive = Boolean(keyword || levelFiltered);
  const includedKeys = collectIncludedKeys(nodes, children, projectFilterPass, keyword, filterActive);
  for (const key of rootKeys(nodes)) computeAggregateData(key, nodes, children);
  const rows: GanttRow[] = [];
  for (const key of rootKeys(nodes)) {
    flattenRows(key, 0, { nodes, children, includedKeys, expandedKeys: input.expandedKeys, filterActive, rows });
  }
  return rows;
}

function rootKeys(nodes: Map<string, GanttNode>) {
  return [...nodes.values()]
    .filter((node) => !node.parentKey)
    .map((node) => node.key);
}

function collectIncludedKeys(
  nodes: Map<string, GanttNode>,
  children: Map<string, string[]>,
  projectFilterPass: Map<string, boolean>,
  keyword: string,
  filterActive: boolean,
) {
  const candidateKeys = new Set<string>();
  for (const node of nodes.values()) {
    const matchesText = !keyword || node.searchText.toLowerCase().includes(keyword);
    const matchesFilter = node.kind === "project"
      ? Boolean(projectFilterPass.get(node.key))
      : node.kind === "task"
        ? Boolean(node.projectKey && projectFilterPass.get(node.projectKey))
        : !filterActive;
    if (matchesText && matchesFilter) candidateKeys.add(node.key);
  }
  if (candidateKeys.size === 0 && filterActive) return candidateKeys;
  if (candidateKeys.size === 0) return new Set(nodes.keys());

  const included = new Set<string>();
  for (const key of candidateKeys) {
    let cursor: string | null | undefined = key;
    while (cursor) {
      included.add(cursor);
      cursor = nodes.get(cursor)?.parentKey;
    }
  }
  return included;
}

function computeAggregateData(key: string, nodes: Map<string, GanttNode>, children: Map<string, string[]>) {
  const node = nodes.get(key);
  if (!node) return { start: null as string | null, end: null as string | null, milestones: [] as GanttMilestoneEvent[] };
  let start = node.startDate;
  let end = node.endDate;
  const milestones = [...node.milestoneEvents];
  for (const childKey of children.get(key) || []) {
    const child = computeAggregateData(childKey, nodes, children);
    start = minDateString(start, child.start);
    end = maxDateString(end, child.end);
    milestones.push(...child.milestones);
  }
  node.aggregateStart = start;
  node.aggregateEnd = end;
  node.milestoneEvents = dedupeMilestones(milestones);
  return { start, end, milestones: node.milestoneEvents };
}

function flattenRows(
  key: string,
  depth: number,
  context: {
    nodes: Map<string, GanttNode>;
    children: Map<string, string[]>;
    includedKeys: Set<string>;
    expandedKeys: Set<string>;
    filterActive: boolean;
    rows: GanttRow[];
  },
) {
  const node = context.nodes.get(key);
  if (!node || !context.includedKeys.has(key)) return;
  const childKeys = (context.children.get(key) || []).filter((childKey) => context.includedKeys.has(childKey));
  const expanded = context.filterActive || context.expandedKeys.has(key);
  context.rows.push({ ...node, depth, hasChildren: childKeys.length > 0, expanded });
  if (!expanded) return;
  for (const childKey of childKeys) flattenRows(childKey, depth + 1, context);
}

function minDateString(left?: string | null, right?: string | null) {
  if (!left) return right ?? null;
  if (!right) return left;
  return left < right ? left : right;
}

function maxDateString(left?: string | null, right?: string | null) {
  if (!left) return right ?? null;
  if (!right) return left;
  return left > right ? left : right;
}

function dedupeMilestones(events: GanttMilestoneEvent[]) {
  const seen = new Set<string>();
  const next: GanttMilestoneEvent[] = [];
  for (const event of events) {
    if (!event.date || seen.has(event.key)) continue;
    seen.add(event.key);
    next.push(event);
  }
  return next.sort((left, right) => left.date.localeCompare(right.date));
}
