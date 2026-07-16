import {
  createEmptySection,
  createFixedSidebarBody,
  createFormSection,
  createPageBody,
  type BodySurfaceProps,
  type FormSurfaceItemSpec,
  type SelectorSurfaceProps,
} from "@workspace/core/ui";
import type {
  AgentConfigurationData,
  AgentConfigurationProfileItem,
  AgentConfigurationRuntimeItem,
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

const STATUS_OPTIONS = [
  { value: "active", label: "启用" },
  { value: "suspended", label: "停用" },
];

function editorState(editor: AgentConfigurationEditor, saving: boolean) {
  return !editor.canConfigure || saving ? "disabled" as const : "normal" as const;
}

function profileEditor(profile: AgentConfigurationProfileItem, editor: AgentConfigurationEditor) {
  const draft = editor.profileDrafts[profile.id] ?? profile;
  const saving = editor.savingKey === `profile:${profile.id}`;
  const state = editorState(editor, saving);
  const items: FormSurfaceItemSpec[] = [
    {
      kind: "readonly",
      key: "actor",
      label: "员工身份",
      value: `${profile.actor.employeeName || "未绑定员工"}${profile.actor.employeeId ? ` · ${profile.actor.employeeId}` : ""}`,
    },
    { kind: "readonly", key: "department", label: "所属部门", value: profile.actor.departmentName || "未绑定部门" },
    { kind: "readonly", key: "position", label: "当前岗位", value: profile.actor.positionName || "未绑定岗位" },
    { kind: "readonly", key: "login", label: "账号状态", value: profile.actor.canLogin ? "允许登录" : "禁止登录" },
    {
      key: "displayName",
      label: "Agent 名称",
      required: true,
      spec: { valueType: "string", control: "text", state },
      value: draft.displayName,
      maxLength: 80,
      onChange: (value) => editor.updateProfile(profile.id, { displayName: String(value ?? "") }),
    },
    {
      key: "roleName",
      label: "Agent 岗位",
      required: true,
      spec: { valueType: "string", control: "text", state },
      value: draft.roleName,
      maxLength: 120,
      onChange: (value) => editor.updateProfile(profile.id, { roleName: String(value ?? "") }),
    },
    {
      key: "responsibilities",
      label: "职责说明",
      required: true,
      span: "wide",
      spec: { valueType: "string", control: "text", multiline: true, state },
      autoGrow: true,
      value: draft.responsibilities,
      rows: 4,
      maxLength: 4_000,
      onChange: (value) => editor.updateProfile(profile.id, { responsibilities: String(value ?? "") }),
    },
    {
      key: "status",
      label: "档案状态",
      spec: {
        valueType: "string",
        control: "choice",
        state,
        options: { source: "static", items: STATUS_OPTIONS },
      },
      value: draft.status,
      onChange: (value) => editor.updateProfile(profile.id, { status: String(value) }),
    },
  ];
  return createFormSection(`agent-profile-editor-${profile.id}`, {
    kind: "fields",
    header: {
      title: profile.displayName,
      description: "组织身份由人事维护；这里仅配置 Agent 名称、岗位、职责和启停状态。",
    },
    content: { items, layout: { flow: "grid", columns: 2, density: "normal" } },
    actions: editor.canConfigure
      ? [{
          key: `save-profile-${profile.id}`,
          action: "save",
          label: saving ? "保存中…" : "保存档案",
          disabled: saving,
          onClick: () => editor.saveProfile(profile.id),
        }]
      : undefined,
  });
}

function profileSelector(
  profiles: AgentConfigurationProfileItem[],
  selectedProfileId: number | null,
  onSelectProfile: (profileId: number) => void,
): SelectorSurfaceProps<AgentConfigurationProfileItem> {
  return {
    kind: "list",
    title: "虚拟员工",
    selectedId: selectedProfileId,
    size: "md",
    emptyText: "暂无 Agent 档案",
    items: profiles.map((profile) => ({
      key: profile.id,
      value: profile,
      card: {
        title: profile.displayName,
        subtitle: profile.roleName,
        code: profile.actor.employeeId || profile.key,
        meta: [profile.actor.departmentName || "未绑定部门", profile.actor.positionName || "未绑定岗位"],
        status: {
          label: profile.status === "active" ? "启用" : "停用",
          tone: profile.status === "active" ? "success" : "warning",
        },
        active: profile.id === selectedProfileId,
        tone: profile.actor.canLogin ? "amber" : "emerald",
      },
    })),
    onSelect: (profile) => onSelectProfile(profile.id),
  };
}

export function profileBody(
  data: AgentConfigurationData,
  editor: AgentConfigurationEditor,
  selectedProfileId: number | null,
  onSelectProfile: (profileId: number) => void,
): BodySurfaceProps {
  const selected = data.profiles.find((profile) => profile.id === selectedProfileId) ?? data.profiles[0];
  if (!selected) return createPageBody([createEmptySection("agent-config-profiles-empty", { content: "暂无 Agent 档案。" })]);
  const selector = profileSelector(data.profiles, selected.id, onSelectProfile);
  return createFixedSidebarBody({
    left: { kind: "selector", selector },
    right: createPageBody([profileEditor(selected, editor)]),
  });
}

function runtimeRows(data: AgentConfigurationData) {
  return data.profiles.flatMap((profile) => profile.runtimes.map((runtime) => ({ profile, runtime })));
}

function runtimeEditor(
  profile: AgentConfigurationProfileItem,
  runtime: AgentConfigurationRuntimeItem,
  editor: AgentConfigurationEditor,
) {
  const draft = editor.runtimeDrafts[runtime.id] ?? runtime;
  const saving = editor.savingKey === `runtime:${runtime.id}`;
  const state = editorState(editor, saving);
  const capabilityOptions = workspaceCapabilityOptions(runtime, draft.capabilityKeys);
  const capabilityItems: FormSurfaceItemSpec[] = runtime.kind === "workspace"
    ? [{
        key: "capabilityKeys",
        label: "允许调用的能力",
        hint: "白名单只能从当前虚拟员工可用的已注册工具中选择。",
        spec: {
          valueType: "string",
          control: "choice",
          multiple: true,
          state,
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
        placeholder: "选择能力",
        emptyText: "当前没有可配置的 Workspace 能力",
        onChange: (value) => editor.updateRuntime(runtime.id, {
          capabilityKeys: Array.isArray(value) ? value.map(String) : [],
        }),
      }]
    : [{
        kind: "tagList",
        key: "capabilityKeys",
        label: "允许调用的能力",
        hint: "外部运行时使用稳定的点分 capability key，例如 code.review。",
        items: draft.capabilityKeys,
        getKey: (key) => key,
        getLabel: (key) => key,
        onRemove: (key) => editor.updateRuntime(runtime.id, {
          capabilityKeys: draft.capabilityKeys.filter((item) => item !== key),
        }),
        disabled: state === "disabled",
        append: {
          textInput: {
            key: `runtime-capability-${runtime.id}`,
            placeholder: "输入 capability key 后回车",
            onAppend: (values) => editor.updateRuntime(runtime.id, {
              capabilityKeys: [...new Set([...draft.capabilityKeys, ...values])],
            }),
            onRemoveLast: () => editor.updateRuntime(runtime.id, {
              capabilityKeys: draft.capabilityKeys.slice(0, -1),
            }),
          },
        },
      }];
  const instructionItem: FormSurfaceItemSpec = {
      key: "instructions",
      label: "Workspace 助手指令",
      required: true,
      span: "wide",
      spec: { valueType: "string", control: "text", multiline: true, state },
      autoGrow: true,
      value: draft.instructions,
      rows: 6,
      maxLength: 12_000,
      onChange: (value) => editor.updateRuntime(runtime.id, { instructions: String(value ?? "") }),
    };
  return createFormSection(`agent-runtime-editor-${runtime.id}-capabilities`, {
    kind: "fields",
    header: {
      title: `${profile.displayName} · Workspace 助手`,
      description: "指令进入每次 Agent 执行上下文；能力白名单参与请求人与虚拟员工的实时权限交集。",
    },
    content: {
      items: [instructionItem, ...capabilityItems],
      layout: { flow: "grid", columns: 2, density: "normal" },
    },
    actions: editor.canConfigure
      ? [{
          key: `save-runtime-${runtime.id}`,
          action: "save",
          label: saving ? "保存中…" : "保存助手行为",
          disabled: saving,
          onClick: () => editor.saveRuntime(profile.id, runtime.id),
        }]
      : undefined,
  });
}

function runtimeSelector(
  data: AgentConfigurationData,
  selectedRuntimeId: number | null,
  onSelectRuntime: (runtimeId: number) => void,
): SelectorSurfaceProps<ReturnType<typeof runtimeRows>[number]> {
  const rows = runtimeRows(data).filter((row) => row.runtime.kind === "workspace");
  return {
    kind: "list",
    title: "Workspace 助手",
    selectedId: selectedRuntimeId,
    size: "md",
    emptyText: "暂无运行时绑定",
    items: rows.map((row) => ({
      key: row.runtime.id,
      value: row,
      card: {
        title: row.profile.displayName,
        subtitle: row.profile.roleName,
        meta: [`${row.runtime.capabilityKeys.length} 项能力`, ...row.runtime.capabilityKeys.slice(0, 2)],
        status: {
          label: row.runtime.configurationValid ? "配置有效" : "配置异常",
          tone: row.runtime.configurationValid ? "success" : "danger",
        },
        active: row.runtime.id === selectedRuntimeId,
        tone: "blue",
      },
    })),
    onSelect: (row) => onSelectRuntime(row.runtime.id),
  };
}

export function capabilityBody(
  data: AgentConfigurationData,
  editor: AgentConfigurationEditor,
  selectedRuntimeId: number | null,
  onSelectRuntime: (runtimeId: number) => void,
): BodySurfaceProps {
  const rows = runtimeRows(data).filter((row) => row.runtime.kind === "workspace");
  const selected = rows.find((row) => row.runtime.id === selectedRuntimeId) ?? rows[0];
  if (!selected) return createPageBody([createEmptySection("agent-config-workspace-runtime-empty", { content: "暂无已接入 Workspace 助手的 Agent。" })]);
  const editorBody = createPageBody([runtimeEditor(selected.profile, selected.runtime, editor)]);
  if (rows.length === 1) return editorBody;
  const selector = runtimeSelector(data, selected.runtime.id, onSelectRuntime);
  return createFixedSidebarBody({
    left: { kind: "selector", selector },
    right: editorBody,
  });
}
