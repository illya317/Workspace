import type { PermissionActionKey } from "@workspace/platform/permission-actions";

export type PermissionMatrixColumnMode = "chain" | "siblings";
export type PermissionMatrixSource = "direct" | "position" | "department" | "ancestor" | "implied" | "system" | "entry" | "implicit" | "child" | "policy" | null;
export type PermissionSourceTone = "gray" | "green" | "orange" | "red" | "yellow" | "blue";

export interface PermissionMatrixColumn {
  key: string;
  columnLabel: string;
  actions: PermissionActionKey[];
  mode?: PermissionMatrixColumnMode;
}

export interface PermissionActionStateLike {
  actionKey: PermissionActionKey;
  has: boolean;
  source?: PermissionMatrixSource;
}

export interface PermissionActionRecordLike<TState extends PermissionActionStateLike = PermissionActionStateLike> {
  actionStates: Partial<Record<PermissionActionKey, TState>>;
  actionTree?: Array<{ key: string; actions: Array<{ actionKey: PermissionActionKey }> }>;
}

export const PERMISSION_MATRIX_ACTION_COLUMNS: PermissionMatrixColumn[] = [
  { key: "basic", columnLabel: "基础权限", actions: ["entry", "read", "create", "update", "delete"], mode: "chain" },
  { key: "workflowSubmit", columnLabel: "发起", actions: ["entry", "read", "create", "reverse", "submit"], mode: "chain" },
  { key: "workflowApprove", columnLabel: "审批", actions: ["entry", "read", "reject", "approve"], mode: "chain" },
  { key: "lifecycle", columnLabel: "生命周期", actions: ["entry", "read", "archive", "revise"], mode: "siblings" },
  { key: "exchange", columnLabel: "数据交换", actions: ["import", "export"], mode: "siblings" },
  { key: "governance", columnLabel: "治理", actions: ["grant", "configure", "audit"], mode: "siblings" },
];

const ACTION_SORT_PRIORITY: Record<PermissionActionKey, number> = {
  grant: 950,
  configure: 930,
  audit: 910,
  delete: 900,
  approve: 820,
  submit: 800,
  update: 700,
  revise: 680,
  archive: 660,
  reverse: 650,
  import: 640,
  export: 620,
  apiUse: 610,
  share: 600,
  lock: 590,
  unlock: 580,
  create: 500,
  reject: 420,
  read: 200,
  entry: 100,
};

export function getPermissionMatrixVisibleColumnActions<TState extends PermissionActionStateLike>(
  record: PermissionActionRecordLike<TState> | null | undefined,
  columnKey: string,
  actions: PermissionActionKey[],
) {
  if (!record) return [];
  if (!record.actionTree) return actions;
  if (columnKey === "workflowSubmit" || columnKey === "workflowApprove") {
    const workflowActions = new Set(record.actionTree.find((group) => group.key === "workflow")?.actions.map((state) => state.actionKey) ?? []);
    const hasWorkflowAction = actions.some((actionKey) => workflowActions.has(actionKey));
    if (!hasWorkflowAction) return [];
    const visibleActions = new Set(record.actionTree.flatMap((group) => group.actions.map((state) => state.actionKey)));
    return actions.filter((actionKey) => visibleActions.has(actionKey));
  }
  const actionGroup = record.actionTree.find((group) => group.key === columnKey);
  const visibleActions = new Set(actionGroup?.actions.map((state) => state.actionKey) ?? []);
  return actions.filter((actionKey) => visibleActions.has(actionKey));
}

export function summarizePermissionActionColumn<TState extends PermissionActionStateLike>(
  record: PermissionActionRecordLike<TState> | null | undefined,
  columnKey: string,
  actions: PermissionActionKey[],
  mode: PermissionMatrixColumnMode = "chain",
): TState[] {
  if (!record) return [];
  const states = getPermissionMatrixVisibleColumnActions(record, columnKey, actions)
    .map((actionKey) => record.actionStates[actionKey])
    .filter((state): state is TState => Boolean(state?.has));
  if (mode === "siblings") return states.filter((state) => state.actionKey !== "entry" && state.actionKey !== "read");
  const highest = [...states].reverse().find(Boolean);
  return highest ? [highest] : [];
}

export function getPermissionActionRecordSortScore(record: PermissionActionRecordLike | null | undefined) {
  if (!record) return 0;
  return Math.max(
    0,
    ...Object.values(record.actionStates).map((state) =>
      state?.has ? ACTION_SORT_PRIORITY[state.actionKey] ?? 0 : 0,
    ),
  );
}

export function sortPermissionSubjectsByScore<TSubject>(
  subjects: TSubject[],
  getScore: (subject: TSubject) => number,
) {
  return subjects
    .map((subject, index) => ({ subject, index, score: getScore(subject) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.subject);
}

export function permissionSourceLabel(source: PermissionMatrixSource): string {
  if (!source) return "未授权";
  if (source === "direct") return "直接授权";
  if (source === "position") return "岗位继承";
  if (source === "department") return "部门继承";
  if (source === "ancestor") return "上层授予";
  if (source === "implied") return "高级隐含";
  if (source === "system" || source === "implicit") return "系统授予";
  if (source === "entry") return "派生入口";
  if (source === "policy") return "智能体策略允许";
  return "下级入口";
}

export function permissionSourceTone(source: PermissionMatrixSource): PermissionSourceTone {
  if (source === "direct" || source === "policy") return "green";
  if (source === "system" || source === "implicit") return "orange";
  if (source === "position" || source === "department") return "red";
  if (source === "ancestor" || source === "implied") return "blue";
  if (source === "entry" || source === "child") return "yellow";
  return "gray";
}
