export type ProjectGanttZoom = "year" | "quarter" | "month";

export type ProjectGanttProject = {
  id: number;
  name: string;
  status: string | null;
  projectLevel: string | null;
  projectType: string;
  isMilestone: boolean;
  parentId: number | null;
  leadingDepartmentId: number | null;
  leadingDepartmentCode: string | null;
  leadingDepartmentName: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type ProjectGanttTask = {
  id: number;
  projectId: number;
  description: string;
  isMilestone: boolean;
  startDate: string | null;
  endDate: string | null;
  predecessorTaskId: number | null;
  sortOrder: number;
};

export type ProjectGanttData = {
  projects: ProjectGanttProject[];
  tasks: ProjectGanttTask[];
};

export type GanttNodeKind = "project" | "task";

type GanttNode = {
  key: string;
  kind: GanttNodeKind;
  name: string;
  parentKey: string | null;
  status: string | null;
  projectLevel: string | null;
  isMilestone: boolean;
  startDate: string | null;
  endDate: string | null;
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

export const PROJECT_GANTT_STATUS_OPTIONS = ["规划中", "进行中", "暂停", "已完成", "已取消"] as const;

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
  statuses: Set<string>;
}) {
  const nodes = new Map<string, GanttNode>();
  const children = new Map<string, string[]>();
  const projectStatusPass = new Map<string, boolean>();
  const keyword = input.keyword.trim().toLowerCase();
  const statusFiltered = input.statuses.size > 0;

  function addNode(node: GanttNode) {
    nodes.set(node.key, node);
    if (!node.parentKey) return;
    const list = children.get(node.parentKey) || [];
    list.push(node.key);
    children.set(node.parentKey, list);
  }

  const projectIds = new Set(input.data.projects.map((project) => project.id));

  for (const project of input.data.projects) {
    const key = projectKey(project.id);
    const parentKey = project.parentId && projectIds.has(project.parentId)
      ? projectKey(project.parentId)
      : null;
    const passes = !statusFiltered || Boolean(project.status && input.statuses.has(project.status));
    projectStatusPass.set(key, passes);
    addNode({
      key,
      kind: "project",
      name: project.name,
      parentKey,
      status: project.status,
      projectLevel: project.projectLevel,
      isMilestone: project.isMilestone,
      startDate: project.startDate,
      endDate: project.endDate,
      searchText: [project.name, project.status, project.projectLevel, project.leadingDepartmentName].filter(Boolean).join(" "),
      projectKey: key,
    });
  }

  for (const task of input.data.tasks) {
    const parentKey = projectKey(task.projectId);
    if (!nodes.has(parentKey)) continue;
    addNode({
      key: taskKey(task.id),
      kind: "task",
      name: task.description,
      parentKey,
      status: null,
      projectLevel: null,
      isMilestone: task.isMilestone,
      startDate: task.startDate,
      endDate: task.endDate,
      searchText: task.description,
      projectKey: parentKey,
    });
  }

  const includedKeys = collectIncludedKeys(nodes, children, projectStatusPass, keyword, statusFiltered);
  for (const key of rootKeys(nodes)) computeAggregateDates(key, nodes, children);
  const rows: GanttRow[] = [];
  for (const key of rootKeys(nodes)) {
    flattenRows(key, 0, { nodes, children, includedKeys, expandedKeys: input.expandedKeys, filterActive: Boolean(keyword || statusFiltered), rows });
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
  projectStatusPass: Map<string, boolean>,
  keyword: string,
  statusFiltered: boolean,
) {
  const candidateKeys = new Set<string>();
  for (const node of nodes.values()) {
    const matchesText = !keyword || node.searchText.toLowerCase().includes(keyword);
    const matchesStatus = node.kind === "project"
      ? Boolean(projectStatusPass.get(node.key))
      : node.kind === "task"
        ? Boolean(node.projectKey && projectStatusPass.get(node.projectKey))
        : !statusFiltered;
    if (matchesText && matchesStatus) candidateKeys.add(node.key);
  }
  if (candidateKeys.size === 0 && (keyword || statusFiltered)) return candidateKeys;
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

function computeAggregateDates(key: string, nodes: Map<string, GanttNode>, children: Map<string, string[]>) {
  const node = nodes.get(key);
  if (!node) return { start: null as string | null, end: null as string | null };
  let start = node.startDate;
  let end = node.endDate;
  for (const childKey of children.get(key) || []) {
    const child = computeAggregateDates(childKey, nodes, children);
    start = minDateString(start, child.start);
    end = maxDateString(end, child.end);
  }
  node.aggregateStart = start;
  node.aggregateEnd = end;
  return { start, end };
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
