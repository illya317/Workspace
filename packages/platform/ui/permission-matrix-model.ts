import type { PermissionActionKey } from "@workspace/platform/permission-actions";

export type PermissionMatrixColumnMode = "chain" | "siblings";
export type PermissionMatrixSource = "direct" | "position" | "department" | "ancestor" | "implied" | "implicit" | "child" | null;
export type PermissionSourceTone = "gray" | "green" | "red" | "yellow" | "blue";

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
}

export const PERMISSION_MATRIX_ACTION_COLUMNS: PermissionMatrixColumn[] = [
  { key: "basic", columnLabel: "基础权限", actions: ["access", "create", "write", "delete"], mode: "chain" },
  { key: "workflowSubmit", columnLabel: "发起", actions: ["access", "create", "withdraw", "submit"], mode: "chain" },
  { key: "workflowApprove", columnLabel: "审批", actions: ["access", "reject", "approve"], mode: "chain" },
  { key: "lifecycle", columnLabel: "生命周期", actions: ["access", "archive", "revise"], mode: "siblings" },
  { key: "exchange", columnLabel: "数据交换", actions: ["import", "export"], mode: "siblings" },
  { key: "admin", columnLabel: "管理", actions: ["admin"], mode: "chain" },
];

export const PERMISSION_MATRIX_MAX_DETAIL_ROWS = Math.max(
  ...PERMISSION_MATRIX_ACTION_COLUMNS.map((column) => column.actions.length),
);

const LEGACY_PERMISSION_SORT_PRIORITY: Record<string, number> = {
  admin: 400,
  delete: 300,
  write: 200,
  create: 150,
  access: 100,
};

const ACTION_SORT_PRIORITY: Record<PermissionActionKey, number> = {
  admin: 1000,
  delete: 900,
  approve: 820,
  submit: 800,
  write: 700,
  revise: 680,
  archive: 660,
  import: 640,
  export: 620,
  create: 500,
  reject: 420,
  withdraw: 400,
  access: 100,
};

export function summarizePermissionActionColumn<TState extends PermissionActionStateLike>(
  record: PermissionActionRecordLike<TState> | null | undefined,
  actions: PermissionActionKey[],
  mode: PermissionMatrixColumnMode = "chain",
): TState[] {
  if (!record) return [];
  const states = actions
    .map((actionKey) => record.actionStates[actionKey])
    .filter((state): state is TState => Boolean(state?.has));
  if (mode === "siblings") return states.filter((state) => state.actionKey !== "access");
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

export function getLegacyPermissionSortScore<TSubject>(
  subject: TSubject,
  roles: { key: string }[],
  getPermissionState: (subject: TSubject, roleKey: string) => { has: boolean },
) {
  return Math.max(
    0,
    ...roles.map((role) =>
      getPermissionState(subject, role.key).has
        ? LEGACY_PERMISSION_SORT_PRIORITY[role.key] ?? 0
        : 0,
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
  if (source === "implicit") return "默认规则";
  return "下级隐含";
}

export function permissionSourceTone(source: PermissionMatrixSource): PermissionSourceTone {
  if (source === "direct") return "green";
  if (source === "position" || source === "department") return "red";
  if (source === "ancestor" || source === "implied" || source === "implicit") return "blue";
  if (source === "child") return "yellow";
  return "gray";
}
