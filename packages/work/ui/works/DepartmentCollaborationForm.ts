import {
  createFormSection,
  createPageBody,
  type BodySurfaceProps,
  type FormSurfaceActionSpec,
  type FormSurfaceFieldSpec,
  type FormSurfaceItemSpec,
} from "@workspace/core/ui";

export type DepartmentOption = { id: number; code: string; name: string };
export type PositionOption = {
  id: number;
  code: string;
  name: string;
  departmentId: number;
  departmentCode: string;
  departmentName: string;
};
export type CollaborationType = "routine" | "periodic" | "event" | "temporary";

export type CollaborationDraft = {
  title: string;
  description: string;
  collaborationType: CollaborationType;
  effectiveFrom: string;
  effectiveTo: string;
  enablingDepartmentIds: number[];
  responsiblePositionIds: number[];
  executorPositionIds: number[];
};

export type DepartmentCollaborationFormInput = {
  mode: "create" | "edit" | "readonly";
  title: string;
  draft: CollaborationDraft;
  departments: DepartmentOption[];
  positions: PositionOption[];
  responsibleDepartmentId: number;
  responsibleDepartmentName: string;
  disabled: boolean;
  saving: boolean;
  actions?: FormSurfaceActionSpec[];
  onSubmit?: () => void;
  onCancel?: () => void;
  setDraft: (updater: (current: CollaborationDraft) => CollaborationDraft) => void;
};

const COLLABORATION_TYPES: Array<{ value: CollaborationType; label: string }> = [
  { value: "routine", label: "日常固定" },
  { value: "periodic", label: "周期触发" },
  { value: "event", label: "事件触发" },
  { value: "temporary", label: "临时协作" },
];

export function emptyCollaborationDraft(): CollaborationDraft {
  return {
    title: "", description: "", collaborationType: "routine", effectiveFrom: "", effectiveTo: "",
    enablingDepartmentIds: [], responsiblePositionIds: [], executorPositionIds: [],
  };
}

export function collaborationDraftCanSubmit(draft: CollaborationDraft) {
  return Boolean(
    draft.title.trim()
    && draft.enablingDepartmentIds.length > 0
    && draft.responsiblePositionIds.length > 0
    && draft.executorPositionIds.length > 0,
  );
}

export function departmentCollaborationFormBody(input: DepartmentCollaborationFormInput): BodySurfaceProps {
  const items = departmentCollaborationFormItems(input);
  const actions = collaborationFormActions(input);
  return createPageBody([
    createFormSection("department-collaboration-form", {
      kind: "fields",
      header: { title: input.title },
      actions,
      submit: input.onSubmit ? { onSubmit: input.onSubmit } : undefined,
      content: { items, layout: { columns: 1, density: "compact" } },
    }),
  ]);
}

export function departmentCollaborationFormItems(input: DepartmentCollaborationFormInput): FormSurfaceItemSpec[] {
  return [
    {
      kind: "section",
      key: "department-collaboration-basic",
      title: "基本信息",
      items: basicFields(input),
      layout: { columns: 2, density: "compact" },
    },
    {
      kind: "section",
      key: "department-collaboration-positions",
      title: "岗位通道",
      items: positionFields(input),
      layout: { columns: 2, density: "compact" },
    },
  ];
}

function collaborationFormActions(input: DepartmentCollaborationFormInput): FormSurfaceActionSpec[] {
  if (input.mode === "readonly") return input.actions ?? [];
  return [...(input.actions ?? []), ...(input.onCancel ? [{
    key: "cancel-department-collaboration",
    action: "cancel" as const,
    label: "取消",
    disabled: input.saving,
    onClick: input.onCancel,
  }] : [])];
}

function basicFields(input: DepartmentCollaborationFormInput): FormSurfaceItemSpec[] {
  const state = input.disabled ? "disabled" as const : "normal" as const;
  return [{
    key: "title", label: "协作事项", required: true, span: "wide",
    spec: { valueType: "string", control: "text", state }, value: input.draft.title,
    placeholder: "例如：月度存货盘点协作", onChange: patchText(input, "title"),
  }, {
    key: "collaborationType", label: "协作类型", required: true,
    spec: { valueType: "string", control: "choice", options: { source: "static", items: COLLABORATION_TYPES }, state },
    value: input.draft.collaborationType,
    onChange: (value) => input.setDraft((current) => ({ ...current, collaborationType: normalizeCollaborationType(value) })),
  }, {
    key: "responsibleDepartment", label: "负责部门", required: true,
    spec: { valueType: "string", control: "text", state: "readonly" }, value: input.responsibleDepartmentName,
  }, ...progressiveChoiceFields({
    key: "enablingDepartment",
    label: "赋能部门",
    ids: input.draft.enablingDepartmentIds,
    options: input.departments
      .filter((department) => department.id !== input.responsibleDepartmentId)
      .map((department) => ({ id: department.id, item: departmentChoice(department) })),
    disabled: input.disabled,
    required: true,
    placeholder: "搜索赋能部门",
    onChange: (ids) => updateEnablingDepartments(input, ids),
  }), {
    key: "description", label: "协作摘要", span: "wide",
    spec: { valueType: "string", control: "text", multiline: true, state }, value: input.draft.description,
    rows: 2, placeholder: "一句话说明协作目的和使用场景", onChange: patchText(input, "description"),
  }, {
    key: "effectiveFrom", label: "生效日期",
    spec: { valueType: "date", control: "temporal", precision: "date", state }, value: input.draft.effectiveFrom,
    placeholder: "可选", onChange: patchText(input, "effectiveFrom"),
  }, {
    key: "effectiveTo", label: "失效日期",
    spec: { valueType: "date", control: "temporal", precision: "date", state }, value: input.draft.effectiveTo,
    placeholder: "长期有效可不填", onChange: patchText(input, "effectiveTo"),
  }];
}

function positionFields(input: DepartmentCollaborationFormInput): FormSurfaceItemSpec[] {
  const responsiblePositions = input.positions.filter((position) => position.departmentId === input.responsibleDepartmentId);
  const enablingIds = new Set(input.draft.enablingDepartmentIds);
  const executorPositions = input.positions.filter((position) => enablingIds.has(position.departmentId));
  return [
    ...progressiveChoiceFields({
      key: "responsiblePosition",
      label: "负责岗位",
      ids: input.draft.responsiblePositionIds,
      options: responsiblePositions.map((position) => ({ id: position.id, item: positionChoice(position) })),
      disabled: input.disabled,
      required: true,
      placeholder: "搜索负责岗位",
      onChange: (ids) => patchIds(input, "responsiblePositionIds", ids),
    }),
    ...progressiveChoiceFields({
      key: "executorPosition",
      label: "执行岗位",
      ids: input.draft.executorPositionIds,
      options: executorPositions.map((position) => ({ id: position.id, item: positionChoice(position) })),
      disabled: input.disabled || enablingIds.size === 0,
      required: true,
      placeholder: "搜索执行岗位",
      disabledPlaceholder: enablingIds.size === 0 ? "请先选择赋能部门" : undefined,
      onChange: (ids) => patchIds(input, "executorPositionIds", ids),
    }),
  ];
}

function updateEnablingDepartments(input: DepartmentCollaborationFormInput, enablingDepartmentIds: number[]) {
  const allowed = new Set(input.positions.filter((position) => enablingDepartmentIds.includes(position.departmentId)).map((position) => position.id));
  input.setDraft((current) => ({ ...current, enablingDepartmentIds, executorPositionIds: current.executorPositionIds.filter((id) => allowed.has(id)) }));
}

function patchIds(input: DepartmentCollaborationFormInput, key: "responsiblePositionIds" | "executorPositionIds", ids: number[]) {
  input.setDraft((current) => ({ ...current, [key]: ids }));
}

function progressiveChoiceFields(input: {
  key: string;
  label: string;
  ids: number[];
  options: Array<{ id: number; item: ReturnType<typeof positionChoice> }>;
  disabled: boolean;
  required?: boolean;
  placeholder: string;
  disabledPlaceholder?: string;
  onChange: (ids: number[]) => void;
}): FormSurfaceFieldSpec[] {
  const selected = new Set(input.ids);
  const fieldCount = input.disabled ? Math.max(1, input.ids.length) : input.ids.length + 1;
  return Array.from({ length: fieldCount }, (_, index) => {
    const selectedId = input.ids[index] ?? null;
    const options = input.options
      .filter((option) => option.id === selectedId || !selected.has(option.id))
      .map((option) => option.item);
    return {
      key: `${input.key}-${index}`,
      label: index === 0 ? input.label : `${input.label} ${index + 1}`,
      required: index === 0 && input.required,
      spec: {
        valueType: "string",
        control: "choice",
        options: { source: "static", items: options, visibleCount: 6 },
        state: input.disabled ? "disabled" : "normal",
      },
      value: selectedId ? String(selectedId) : "",
      placeholder: input.disabledPlaceholder ?? input.placeholder,
      onChange: (value) => updateProgressiveIds(input.ids, index, value, input.onChange),
    };
  });
}

function updateProgressiveIds(current: number[], index: number, value: unknown, onChange: (ids: number[]) => void) {
  const nextId = Number(value);
  const next = [...current];
  if (Number.isInteger(nextId) && nextId > 0) {
    if (index < next.length) next[index] = nextId;
    else next.push(nextId);
  } else if (index < next.length) {
    next.splice(index, 1);
  }
  onChange(Array.from(new Set(next)));
}
function departmentChoice(option: DepartmentOption) { return { value: String(option.id), label: option.name, description: option.code, searchText: `${option.name} ${option.code}` }; }
function positionChoice(option: PositionOption) { return { value: String(option.id), label: option.name, description: `${option.departmentName} · ${option.code}`, searchText: `${option.name} ${option.code} ${option.departmentName}` }; }
function patchText<K extends Exclude<keyof CollaborationDraft, "collaborationType" | "enablingDepartmentIds" | "responsiblePositionIds" | "executorPositionIds">>(input: DepartmentCollaborationFormInput, key: K) {
  return (value: unknown) => input.setDraft((current) => ({ ...current, [key]: String(value ?? "") }));
}
function normalizeCollaborationType(value: unknown): CollaborationType {
  return COLLABORATION_TYPES.some((option) => option.value === value) ? value as CollaborationType : "routine";
}
