import {
  ERP_DILIGENCE_AREA_OPTIONS,
  ERP_DILIGENCE_EVIDENCE_TYPES,
  type ErpDiligenceQuestionSection,
} from "@workspace/administration/constants";
import type {
  ErpDiligenceDraft,
  ErpDiligenceEvidenceItem,
  ErpDiligenceProcessStep,
} from "@workspace/administration/types";
import type { FormSurfaceItemSpec } from "@workspace/core/ui";

type DraftSetter = (updater: (current: ErpDiligenceDraft) => ErpDiligenceDraft) => void;

function textField(input: {
  key: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  editable: boolean;
  hint?: string;
  placeholder?: string;
  multiline?: boolean;
  span?: 1 | 2 | "wide";
  required?: boolean;
}): FormSurfaceItemSpec {
  return {
    key: input.key,
    label: input.label,
    value: input.value,
    required: input.required,
    hint: input.hint,
    placeholder: input.placeholder,
    span: input.span,
    rows: input.multiline ? 4 : undefined,
    resize: input.multiline ? "vertical" : undefined,
    spec: {
      valueType: "string",
      control: "text",
      multiline: input.multiline,
      state: input.editable ? "normal" : "readonly",
    },
    onChange: (value) => input.onChange(String(value ?? "")),
  };
}

export function profileItems(draft: ErpDiligenceDraft, setDraft: DraftSetter, editable: boolean): FormSurfaceItemSpec[] {
  return [
    { kind: "readonly", key: "respondentName", label: "填报人", value: draft.respondentName || "当前用户" },
    textField({
      key: "departmentName",
      label: "部门",
      value: draft.departmentName,
      required: true,
      editable,
      placeholder: "填写实际参与该流程的部门",
      onChange: (departmentName) => setDraft((current) => ({ ...current, departmentName })),
    }),
    textField({
      key: "roleTitle",
      label: "岗位/职责",
      value: draft.roleTitle,
      required: true,
      editable,
      placeholder: "例如：销售内勤、项目经理、应收会计",
      onChange: (roleTitle) => setDraft((current) => ({ ...current, roleTitle })),
    }),
    {
      key: "primaryArea",
      label: "主要参与环节",
      value: draft.primaryArea,
      required: true,
      placeholder: "选择最接近的职责",
      spec: {
        valueType: "string",
        control: "choice",
        options: { source: "static", items: [...ERP_DILIGENCE_AREA_OPTIONS] },
        state: editable ? "normal" : "readonly",
      },
      onChange: (value) => setDraft((current) => ({ ...current, primaryArea: String(value ?? "") })),
    },
  ];
}

export function questionItems(
  sections: readonly ErpDiligenceQuestionSection[],
  draft: ErpDiligenceDraft,
  setDraft: DraftSetter,
  editable: boolean,
): FormSurfaceItemSpec[] {
  return sections.map((section) => ({
    kind: "section",
    key: section.key,
    title: section.title,
    subtitle: section.description,
    chrome: "divider",
    layout: { columns: 2 },
    items: section.questions.map((question) => textField({
      key: question.key,
      label: question.label,
      value: draft.answers[question.key] ?? "",
      hint: question.prompt,
      placeholder: "请按当前真实做法填写；没有则写“无”",
      multiline: true,
      span: 1,
      editable,
      onChange: (value) => setDraft((current) => ({
        ...current,
        answers: { ...current.answers, [question.key]: value },
      })),
    })),
  }));
}

function newKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function newProcessStep(): ErpDiligenceProcessStep {
  return { key: newKey("step"), name: "", trigger: "", owner: "", inputOutput: "", tool: "", handoff: "", exceptions: "" };
}

function newEvidenceItem(): ErpDiligenceEvidenceItem {
  return { key: newKey("evidence"), documentType: "", sampleLocation: "", owner: "", notes: "" };
}

export function processItems(draft: ErpDiligenceDraft, setDraft: DraftSetter, editable: boolean): FormSurfaceItemSpec[] {
  const update = (key: string, field: keyof ErpDiligenceProcessStep, value: string) => setDraft((current) => ({
    ...current,
    processSteps: current.processSteps.map((step) => step.key === key ? { ...step, [field]: value } : step),
  }));
  return [{
    kind: "repeatable",
    key: "processSteps",
    title: "流程步骤",
    subtitle: "从你接到什么开始，逐步写到交给谁；建议一行一个实际动作。",
    empty: "还没有流程步骤。先新增你最熟悉的一步。",
    layout: { columns: 2 },
    addAction: editable ? {
      key: "add-step",
      label: "新增步骤",
      icon: "add",
      onClick: () => setDraft((current) => ({ ...current, processSteps: [...current.processSteps, newProcessStep()] })),
    } : undefined,
    items: draft.processSteps.map((step, index) => ({
      key: step.key,
      title: `步骤 ${index + 1}${step.name ? ` · ${step.name}` : ""}`,
      actions: editable ? [{
        key: `remove-${step.key}`,
        label: "删除",
        icon: "delete",
        variant: "danger",
        onClick: () => setDraft((current) => ({ ...current, processSteps: current.processSteps.filter((item) => item.key !== step.key) })),
      }] : undefined,
      items: [
        textField({ key: `${step.key}-name`, label: "动作名称", value: step.name, required: true, editable, placeholder: "例如：创建报价单", onChange: (value) => update(step.key, "name", value) }),
        textField({ key: `${step.key}-owner`, label: "责任人/岗位", value: step.owner, editable, onChange: (value) => update(step.key, "owner", value) }),
        textField({ key: `${step.key}-trigger`, label: "触发条件", value: step.trigger, editable, onChange: (value) => update(step.key, "trigger", value) }),
        textField({ key: `${step.key}-tool`, label: "使用工具", value: step.tool, editable, placeholder: "系统、Excel、邮件、微信或纸质", onChange: (value) => update(step.key, "tool", value) }),
        textField({ key: `${step.key}-inputOutput`, label: "输入与产出", value: step.inputOutput, editable, multiline: true, onChange: (value) => update(step.key, "inputOutput", value) }),
        textField({ key: `${step.key}-handoff`, label: "交给谁/如何确认", value: step.handoff, editable, multiline: true, onChange: (value) => update(step.key, "handoff", value) }),
        textField({ key: `${step.key}-exceptions`, label: "例外与返工", value: step.exceptions, editable, multiline: true, span: "wide", onChange: (value) => update(step.key, "exceptions", value) }),
      ],
    })),
  }];
}

export function evidenceItems(draft: ErpDiligenceDraft, setDraft: DraftSetter, editable: boolean): FormSurfaceItemSpec[] {
  const update = (key: string, field: keyof ErpDiligenceEvidenceItem, value: string) => setDraft((current) => ({
    ...current,
    evidenceItems: current.evidenceItems.map((item) => item.key === key ? { ...item, [field]: value } : item),
  }));
  return [{
    kind: "repeatable",
    key: "evidenceItems",
    title: "样表与材料",
    subtitle: "只登记材料类型、存放位置和负责人；第一阶段不在这里上传敏感原件。",
    empty: "还没有登记材料。建议至少列出一份现有样表或台账。",
    layout: { columns: 2 },
    addAction: editable ? {
      key: "add-evidence",
      label: "新增材料",
      icon: "add",
      onClick: () => setDraft((current) => ({ ...current, evidenceItems: [...current.evidenceItems, newEvidenceItem()] })),
    } : undefined,
    items: draft.evidenceItems.map((item, index) => ({
      key: item.key,
      title: `材料 ${index + 1}`,
      actions: editable ? [{
        key: `remove-${item.key}`,
        label: "删除",
        icon: "delete",
        variant: "danger",
        onClick: () => setDraft((current) => ({ ...current, evidenceItems: current.evidenceItems.filter((entry) => entry.key !== item.key) })),
      }] : undefined,
      items: [
        {
          key: `${item.key}-documentType`,
          label: "材料类型",
          value: item.documentType,
          spec: { valueType: "string", control: "choice", options: { source: "static", items: [...ERP_DILIGENCE_EVIDENCE_TYPES] }, state: editable ? "normal" : "readonly" },
          onChange: (value) => update(item.key, "documentType", String(value ?? "")),
        },
        textField({ key: `${item.key}-owner`, label: "材料负责人", value: item.owner, editable, onChange: (value) => update(item.key, "owner", value) }),
        textField({ key: `${item.key}-sampleLocation`, label: "存放位置/链接", value: item.sampleLocation, editable, span: "wide", placeholder: "例如：共享盘路径、系统菜单或文档链接", onChange: (value) => update(item.key, "sampleLocation", value) }),
        textField({ key: `${item.key}-notes`, label: "说明", value: item.notes, editable, multiline: true, span: "wide", onChange: (value) => update(item.key, "notes", value) }),
      ],
    })),
  }];
}
