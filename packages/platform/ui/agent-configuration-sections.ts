import {
  createEmptySection,
  createFormSection,
  createListSection,
  createMessageSection,
  createMetricsSection,
  createSectionSection,
  type BodySurfaceBadgeSpec,
  type BodySurfaceSectionSpec,
  type FormSurfaceItemSpec,
} from "@workspace/core/ui";
import type {
  AgentConfigurationData,
  AgentConfigurationProfileItem,
  AgentConfigurationRuntimeItem,
  AgentManagementRuntimeKind,
} from "@workspace/platform/types";
import { workspaceCapabilityOptions } from "./agent-configuration-refresh";

export type AgentProfileConfigurationDraft = Pick<
  AgentConfigurationProfileItem,
  "displayName" | "roleName" | "responsibilities" | "status"
>;

export type AgentRuntimeConfigurationDraft = Pick<
  AgentConfigurationRuntimeItem,
  "status" | "interactive" | "instructions" | "capabilityKeys"
>;

export type AgentConfigurationEditor = {
  canConfigure: boolean;
  savingKey: string | null;
  profileDrafts: Record<number, AgentProfileConfigurationDraft>;
  runtimeDrafts: Record<number, AgentRuntimeConfigurationDraft>;
  updateProfile: (profileId: number, patch: Partial<AgentProfileConfigurationDraft>) => void;
  updateRuntime: (runtimeId: number, patch: Partial<AgentRuntimeConfigurationDraft>) => void;
  saveProfile: (profileId: number) => void;
  saveRuntime: (profileId: number, runtimeId: number) => void;
};

const RUNTIME_LABELS: Record<AgentManagementRuntimeKind, string> = {
  workspace: "Workspace",
  codex_local: "本地 Codex",
  ci: "CI",
  server_ops: "服务器运维",
};

const STATUS_OPTIONS = [
  { value: "active", label: "启用" },
  { value: "suspended", label: "停用" },
];

function statusBadge(status: string): BodySurfaceBadgeSpec {
  return status === "active"
    ? { key: "status", label: "已启用", tone: "success" }
    : { key: "status", label: "已停用", tone: "warning" };
}

function profileReadonlyList(data: AgentConfigurationData) {
  return data.profiles.length > 0
    ? createListSection("agent-config-profiles-list", {
        presentation: "cards",
        items: data.profiles.map((profile) => ({
          key: profile.key,
          title: `${profile.displayName} · ${profile.roleName}`,
          description: profile.responsibilities,
          trailing: profile.actor.employeeId ? `员工编号 ${profile.actor.employeeId}` : "未绑定员工编号",
          badges: [
            statusBadge(profile.status),
            { key: "employee", label: profile.actor.employeeName || "未绑定员工", tone: profile.actor.employeeName ? "info" as const : "warning" as const },
            { key: "department", label: profile.actor.departmentName || "未绑定部门", tone: profile.actor.departmentName ? "muted" as const : "warning" as const },
            { key: "position", label: profile.actor.positionName || "未绑定岗位", tone: profile.actor.positionName ? "muted" as const : "warning" as const },
            { key: "login", label: profile.actor.canLogin ? "账号可登录" : "账号禁止登录", tone: profile.actor.canLogin ? "danger" as const : "success" as const },
          ],
        })),
      })
    : createEmptySection("agent-config-profiles-empty", { content: "暂无 Agent 档案。" });
}

function profileEditor(profile: AgentConfigurationProfileItem, editor: AgentConfigurationEditor) {
  const draft = editor.profileDrafts[profile.id] ?? profile;
  const saving = editor.savingKey === `profile:${profile.id}`;
  const items: FormSurfaceItemSpec[] = [
    { kind: "readonly", key: "profile-key", label: "Profile key", value: profile.key, hint: "稳定身份，不可在配置中心修改。" },
    { kind: "readonly", key: "actor", label: "虚拟员工", value: `${profile.actor.employeeName || "未绑定员工"}${profile.actor.employeeId ? ` · ${profile.actor.employeeId}` : ""}` },
    {
      key: "displayName",
      label: "Agent 名称",
      required: true,
      spec: { valueType: "string", control: "text", state: saving ? "disabled" : "normal" },
      value: draft.displayName,
      maxLength: 80,
      onChange: (value) => editor.updateProfile(profile.id, { displayName: String(value ?? "") }),
    },
    {
      key: "roleName",
      label: "岗位名称",
      required: true,
      spec: { valueType: "string", control: "text", state: saving ? "disabled" : "normal" },
      value: draft.roleName,
      maxLength: 120,
      onChange: (value) => editor.updateProfile(profile.id, { roleName: String(value ?? "") }),
    },
    {
      key: "responsibilities",
      label: "职责说明",
      required: true,
      span: "wide",
      spec: { valueType: "string", control: "text", multiline: true, state: saving ? "disabled" : "normal" },
      value: draft.responsibilities,
      rows: 4,
      maxLength: 4_000,
      onChange: (value) => editor.updateProfile(profile.id, { responsibilities: String(value ?? "") }),
    },
    {
      key: "status",
      label: "档案状态",
      spec: { valueType: "string", control: "choice", state: saving ? "disabled" : "normal", options: { source: "static", items: STATUS_OPTIONS } },
      value: draft.status,
      onChange: (value) => editor.updateProfile(profile.id, { status: String(value) }),
    },
  ];
  return createFormSection(`agent-profile-editor-${profile.id}`, {
    kind: "fields",
    header: { title: `${profile.displayName} · Agent 档案`, description: "员工、账号与 Profile key 是只读身份事实；这里维护名称、岗位职责与启停状态。" },
    content: { items, layout: { flow: "grid", columns: 2, density: "compact" } },
    actions: [{ key: `save-profile-${profile.id}`, action: "save", label: saving ? "保存中…" : "保存档案", disabled: saving, onClick: () => editor.saveProfile(profile.id) }],
  });
}

export function profileSections(data: AgentConfigurationData, editor: AgentConfigurationEditor): BodySurfaceSectionSpec[] {
  const content = editor.canConfigure
    ? data.profiles.map((profile) => profileEditor(profile, editor))
    : [profileReadonlyList(data)];
  return [
    createMetricsSection("agent-config-profile-metrics", {
      metrics: [
        { key: "profiles", label: "Agent 档案", value: data.profiles.length },
        { key: "active", label: "已启用", value: data.profiles.filter((profile) => profile.status === "active").length },
        { key: "employees", label: "HR 员工已绑定", value: data.profiles.filter((profile) => profile.actor.employeeId).length },
        { key: "non-login", label: "禁止登录账号", value: data.profiles.filter((profile) => !profile.actor.canLogin).length },
      ],
    }),
    ...(!editor.canConfigure ? [createMessageSection("agent-config-profile-readonly", { tone: "muted", content: "当前只有读取权限；保存 Agent 档案需要 agent.config.configure。" })] : []),
    createSectionSection("agent-config-profiles", { title: "虚拟员工 Agent 档案", sections: content }),
    createMessageSection("agent-config-hr-owner", {
      content: "员工编号、任职、部门和岗位由人事管理维护；Agent 配置只维护执行身份的名称、职责与启停状态。",
      tone: "muted",
      link: { label: "打开人事基础资料", href: "/hr/roster" },
    }),
  ];
}

function runtimeEditor(
  profile: AgentConfigurationProfileItem,
  runtime: AgentConfigurationRuntimeItem,
  editor: AgentConfigurationEditor,
  capabilityOnly: boolean,
) {
  const draft = editor.runtimeDrafts[runtime.id] ?? runtime;
  const saving = editor.savingKey === `runtime:${runtime.id}`;
  const capabilityOptions = workspaceCapabilityOptions(runtime, draft.capabilityKeys);
  const capabilityItems: FormSurfaceItemSpec[] = runtime.kind === "workspace"
    ? [{
        key: "capabilityKeys",
        label: "运行时能力白名单",
        hint: `只能从虚拟员工当前可用的 ${runtime.availableCapabilities.length} 项已注册工具中选择。`,
        spec: {
          valueType: "string",
          control: "choice",
          multiple: true,
          state: saving ? "disabled" : "normal",
          options: {
            source: "static",
            visibleCount: 12,
            items: capabilityOptions.map((capability) => ({
              value: capability.key,
              label: capability.label,
              description: capability.description,
            })),
          },
        },
        value: draft.capabilityKeys,
        placeholder: "选择已注册能力",
        emptyText: "当前没有可配置的 Workspace 能力",
        onChange: (value) => editor.updateRuntime(runtime.id, {
          capabilityKeys: Array.isArray(value) ? value.map(String) : [],
        }),
      }]
    : [{
        kind: "tagList",
        key: "capabilityKeys",
        label: "运行时能力白名单",
        hint: "外部运行时尚无适配器目录；key 必须使用稳定的点分命名，例如 code.review。",
        items: draft.capabilityKeys,
        getKey: (key) => key,
        getLabel: (key) => key,
        onRemove: (key) => editor.updateRuntime(runtime.id, { capabilityKeys: draft.capabilityKeys.filter((item) => item !== key) }),
        disabled: saving,
        append: {
          textInput: {
            key: `runtime-capability-${runtime.id}`,
            placeholder: "输入 capability key 后回车",
            onAppend: (values) => editor.updateRuntime(runtime.id, { capabilityKeys: [...new Set([...draft.capabilityKeys, ...values])] }),
            onRemoveLast: () => editor.updateRuntime(runtime.id, { capabilityKeys: draft.capabilityKeys.slice(0, -1) }),
          },
        },
      }];
  const runtimeItems: FormSurfaceItemSpec[] = [
    { kind: "readonly", key: "runtimeKind", label: "运行时类型", value: RUNTIME_LABELS[runtime.kind], hint: "运行时类型是稳定绑定事实，不可修改。" },
    {
      key: "status",
      label: "运行时状态",
      spec: { valueType: "string", control: "choice", state: saving ? "disabled" : "normal", options: { source: "static", items: STATUS_OPTIONS } },
      value: draft.status,
      onChange: (value) => editor.updateRuntime(runtime.id, { status: String(value) }),
    },
    {
      key: "interactive",
      label: "允许交互",
      spec: { valueType: "boolean", control: "boolean", presentation: "switch", state: saving ? "disabled" : "normal" },
      value: draft.interactive,
      onChange: (value) => editor.updateRuntime(runtime.id, { interactive: Boolean(value) }),
    },
    {
      key: "instructions",
      label: "运行时职责指令",
      required: true,
      span: "wide",
      spec: { valueType: "string", control: "text", multiline: true, state: saving ? "disabled" : "normal" },
      value: draft.instructions,
      rows: 5,
      maxLength: 12_000,
      onChange: (value) => editor.updateRuntime(runtime.id, { instructions: String(value ?? "") }),
    },
  ];
  return createFormSection(`agent-runtime-editor-${runtime.id}-${capabilityOnly ? "capabilities" : "runtime"}`, {
    kind: "fields",
    header: {
      title: `${profile.displayName} · ${RUNTIME_LABELS[runtime.kind]}`,
      description: capabilityOnly ? "白名单只能收窄可调用能力，不会创建或授予任何组织 RBAC 权限。" : "“启用”只表示配置可用，不代表外部运行器在线。",
    },
    content: { items: capabilityOnly ? capabilityItems : runtimeItems, layout: { flow: "grid", columns: 2, density: "compact" } },
    actions: [{ key: `save-runtime-${runtime.id}`, action: "save", label: saving ? "保存中…" : capabilityOnly ? "保存能力白名单" : "保存运行配置", disabled: saving, onClick: () => editor.saveRuntime(profile.id, runtime.id) }],
  });
}

function runtimeRows(data: AgentConfigurationData) {
  return data.profiles.flatMap((profile) => profile.runtimes.map((runtime) => ({ profile, runtime })));
}

export function runtimeSections(data: AgentConfigurationData, editor: AgentConfigurationEditor): BodySurfaceSectionSpec[] {
  const runtimes = runtimeRows(data);
  const list = runtimes.length === 0
    ? createEmptySection("agent-config-runtimes-empty", { content: "暂无运行时绑定。" })
    : createListSection("agent-config-runtimes-list", {
        presentation: "list",
        items: runtimes.map(({ profile, runtime }) => ({
          key: `${profile.key}:${runtime.kind}`,
          title: `${profile.displayName} · ${RUNTIME_LABELS[runtime.kind]}`,
          description: runtime.instructions,
          meta: `${runtime.interactive ? "可交互" : "非交互"} · ${runtime.capabilityKeys.length} 项能力`,
          badges: [
            statusBadge(runtime.status),
            { key: "config", label: runtime.configurationValid ? "配置有效" : "配置异常", tone: runtime.configurationValid ? "success" as const : "danger" as const },
            { key: "receipt", label: runtime.receiptState === "workspace_audit" ? "Workspace 审计已接入" : "任务回执未接入", tone: runtime.receiptState === "workspace_audit" ? "info" as const : "warning" as const },
          ],
        })),
      });
  const content = editor.canConfigure
    ? runtimes.map(({ profile, runtime }) => runtimeEditor(profile, runtime, editor, false))
    : [list];
  return [
    createMetricsSection("agent-config-runtime-metrics", {
      metrics: [
        { key: "runtimes", label: "运行时绑定", value: runtimes.length },
        { key: "workspace", label: "Workspace", value: runtimes.filter(({ runtime }) => runtime.kind === "workspace").length },
        { key: "external", label: "外部运行时", value: runtimes.filter(({ runtime }) => runtime.kind !== "workspace").length },
        { key: "receipts", label: "回执已接入", value: runtimes.filter(({ runtime }) => runtime.receiptState === "workspace_audit").length },
      ],
    }),
    ...(!editor.canConfigure ? [createMessageSection("agent-config-runtime-readonly", { tone: "muted", content: "当前只有读取权限；保存运行配置需要 agent.config.configure。" })] : []),
    createSectionSection("agent-config-runtimes", { title: "身份与运行载体绑定", sections: content }),
  ];
}

export function permissionSections(
  data: AgentConfigurationData,
  editor: AgentConfigurationEditor,
  managementSections: BodySurfaceSectionSpec[],
): BodySurfaceSectionSpec[] {
  const rows = runtimeRows(data);
  const capabilitySections = editor.canConfigure
    ? rows.map(({ profile, runtime }) => runtimeEditor(profile, runtime, editor, true))
    : [rows.length > 0
        ? createListSection("agent-config-capabilities-list", {
            presentation: "list",
            items: rows.map(({ profile, runtime }) => ({
              key: `${profile.key}:${runtime.kind}`,
              title: `${profile.displayName} · ${RUNTIME_LABELS[runtime.kind]}`,
              description: runtime.capabilityKeys.length > 0 ? runtime.capabilityKeys.join(" · ") : "未声明能力",
              badges: [{ key: "count", label: `${runtime.capabilityKeys.length} 项`, tone: runtime.capabilityKeys.length > 0 ? "info" as const : "warning" as const }],
            })),
          })
        : createEmptySection("agent-config-capabilities-empty", { content: "暂无运行时能力声明。" })];
  const workspaceOptions = rows.flatMap(({ runtime }) => runtime.availableCapabilities);
  const uniqueWorkspaceOptions = [...new Map(workspaceOptions.map((option) => [option.key, option])).values()];
  return [
    createMetricsSection("agent-config-permission-metrics", {
      metrics: [
        { key: "global-actions", label: "全局允许动作", value: data.globalActionCeiling.length },
        { key: "runtime-capabilities", label: "运行时能力声明", value: rows.reduce((sum, row) => sum + row.runtime.capabilityKeys.length, 0) },
        { key: "permission-layers", label: "运行时权限交集", value: data.permissionLayers.length },
      ],
    }),
    createSectionSection("agent-config-permission-model", {
      title: "四层权限交集",
      sections: [createListSection("agent-config-permission-model-list", {
        presentation: "cards",
        items: data.permissionLayers.map((layer) => ({ key: layer.key, title: layer.label, description: layer.description, trailing: `归属：${layer.owner}` })),
      })],
    }),
    ...managementSections,
    ...(uniqueWorkspaceOptions.length > 0 ? [createSectionSection("agent-config-workspace-catalog", {
      title: "Workspace 已注册且虚拟员工可用的能力",
      sections: [createListSection("agent-config-workspace-catalog-list", {
        presentation: "list",
        density: "compact",
        items: uniqueWorkspaceOptions.map((option) => ({ key: option.key, title: option.key, description: `${option.label} · ${option.description}` })),
      })],
    })] : []),
    ...(!editor.canConfigure ? [createMessageSection("agent-config-capability-readonly", { tone: "muted", content: "当前只有读取权限；保存运行时能力白名单需要 agent.config.configure。" })] : []),
    createSectionSection("agent-config-capabilities", { title: "运行时能力白名单", sections: capabilitySections }),
  ];
}
