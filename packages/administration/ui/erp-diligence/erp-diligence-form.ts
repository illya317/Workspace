import {
  calculateErpDiligenceOpportunity,
  ERP_DILIGENCE_AREA_OPTIONS,
  ERP_DILIGENCE_EVIDENCE_COMPLETENESS_OPTIONS,
  ERP_DILIGENCE_EVIDENCE_FORMAT_OPTIONS,
  ERP_DILIGENCE_EVIDENCE_TYPES,
  ERP_DILIGENCE_EVIDENCE_UPDATE_OPTIONS,
  ERP_DILIGENCE_EXECUTION_MODE_OPTIONS,
  ERP_DILIGENCE_FREQUENCY_OPTIONS,
  ERP_DILIGENCE_HANDOFF_OPTIONS,
  ERP_DILIGENCE_INPUT_STRUCTURE_OPTIONS,
  ERP_DILIGENCE_LOG_OPTIONS,
  ERP_DILIGENCE_PAIN_POINT_OPTIONS,
  ERP_DILIGENCE_PROCESS_ACTIVITY_OPTIONS,
  ERP_DILIGENCE_RATE_OPTIONS,
  ERP_DILIGENCE_REVIEW_OPTIONS,
  ERP_DILIGENCE_RISK_OPTIONS,
  ERP_DILIGENCE_RULE_TYPE_OPTIONS,
  ERP_DILIGENCE_SYSTEM_COUNT_OPTIONS,
  ERP_DILIGENCE_TIME_OPTIONS,
  ERP_DILIGENCE_VARIABILITY_OPTIONS,
  ERP_DILIGENCE_VOLUME_OPTIONS,
  ERP_DILIGENCE_WAIT_OPTIONS,
  type ErpDiligenceOption,
  type ErpDiligenceQuestionSection,
} from "@workspace/administration/constants";
import type {
  ErpDiligenceDraft,
  ErpDiligenceEvidenceAttachment,
  ErpDiligenceEvidenceItem,
  ErpDiligencePositionOption,
  ErpDiligenceProcessStep,
  ErpDiligenceResponsibilityPositionOption,
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

export function profileItems(
  draft: ErpDiligenceDraft,
  setDraft: DraftSetter,
  editable: boolean,
  positionOptions: readonly ErpDiligencePositionOption[] = [],
): FormSurfaceItemSpec[] {
  const roleItem: FormSurfaceItemSpec = editable ? {
    key: "positionAssignmentId",
    label: "岗位",
    value: draft.positionAssignmentId ? String(draft.positionAssignmentId) : "",
    required: true,
    placeholder: positionOptions.length > 0 ? "选择当前在岗岗位" : "HR 中未配置在岗岗位",
    hint: positionOptions.length > 0 ? "仅显示当前填报人在 HR 中有效的岗位" : "请先在 HR 中维护当前员工的部门岗位关系",
    spec: {
      valueType: "string",
      control: "choice",
      options: {
        source: "static",
        items: positionOptions.map((option) => ({
          value: String(option.assignmentId),
          label: option.positionName,
          description: `${option.departmentCode} · ${option.departmentName}`,
        })),
      },
      state: positionOptions.length > 0 ? "normal" : "disabled",
    },
    onChange: (value) => {
      const selection = positionOptions.find((option) => option.assignmentId === Number(value));
      setDraft((current) => ({
        ...current,
        positionAssignmentId: selection?.assignmentId ?? null,
        roleTitle: selection?.positionName ?? "",
        departmentName: selection?.departmentName ?? "",
        processSteps: current.processSteps.map((step) => ({
          ...step,
          ownerPositionId: null,
          ownerPositionName: "",
          ownerDepartmentName: "",
        })),
        evidenceItems: current.evidenceItems.map((item) => ({
          ...item,
          ownerPositionId: null,
          ownerPositionName: "",
          ownerDepartmentName: "",
        })),
      }));
    },
  } : {
    kind: "readonly",
    key: "roleTitle",
    label: "岗位",
    value: draft.roleTitle || "未选择",
  };

  return [
    { kind: "readonly", key: "respondentName", label: "填报人", value: draft.respondentName || "当前用户" },
    roleItem,
    { kind: "readonly", key: "departmentName", label: "部门", value: draft.departmentName || "选择岗位后自动带入" },
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
    items: section.questions.map((question) => {
      const multiple = question.control === "multiple";
      const current = draft.answers[question.key];
      return {
        key: question.key,
        label: question.label,
        value: multiple
          ? Array.isArray(current) ? current : current ? [current] : []
          : Array.isArray(current) ? current[0] ?? "" : current ?? "",
        placeholder: question.prompt,
        spec: {
          valueType: multiple ? "array" : "string",
          control: "choice",
          multiple,
          options: { source: "static", items: [...(question.options ?? [])] },
          state: editable ? "normal" : "readonly",
        },
        onChange: (value: unknown) => setDraft((draftValue) => ({
          ...draftValue,
          answers: {
            ...draftValue.answers,
            [question.key]: multiple
              ? Array.isArray(value) ? value.map(String) : []
              : String(value ?? ""),
          },
        })),
      } satisfies FormSurfaceItemSpec;
    }),
  }));
}

function newKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function newProcessStep(): ErpDiligenceProcessStep {
  return {
    key: newKey("step"),
    activityKey: "",
    ownerPositionId: null,
    ownerPositionName: "",
    ownerDepartmentName: "",
    frequency: "",
    volumeBand: "",
    touchTimeBand: "",
    waitTimeBand: "",
    executionMode: "",
    inputStructure: "",
    ruleType: "",
    variability: "",
    exceptionRate: "",
    errorRate: "",
    handoffMode: "",
    systemCount: "",
    logAvailability: "",
    riskLevel: "",
    reviewRequirement: "",
    painPoints: [],
    notes: "",
  };
}

function newEvidenceItem(): ErpDiligenceEvidenceItem {
  return {
    key: newKey("evidence"),
    documentType: "",
    format: "",
    updateFrequency: "",
    completeness: "",
    sampleLocation: "",
    ownerPositionId: null,
    ownerPositionName: "",
    ownerDepartmentName: "",
    notes: "",
    attachments: [],
  };
}

function attachmentSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function choiceItem(input: {
  key: string;
  label: string;
  value: string | string[];
  options: readonly ErpDiligenceOption[];
  editable: boolean;
  onChange: (value: unknown) => void;
  required?: boolean;
  multiple?: boolean;
  hint?: string;
}): FormSurfaceItemSpec {
  return {
    key: input.key,
    label: input.label,
    value: input.value,
    required: input.required,
    hint: input.hint,
    placeholder: input.multiple ? "可多选" : "请选择",
    spec: {
      valueType: input.multiple ? "array" : "string",
      control: "choice",
      multiple: input.multiple,
      options: { source: "static", items: [...input.options] },
      state: input.editable ? "normal" : "readonly",
    },
    onChange: input.onChange,
  };
}

function responsibilityItem(input: {
  key: string;
  label: string;
  positionId: number | null;
  positionName: string;
  departmentName: string;
  positions: readonly ErpDiligenceResponsibilityPositionOption[];
  editable: boolean;
  onSelect: (position: ErpDiligenceResponsibilityPositionOption | null) => void;
}): FormSurfaceItemSpec {
  if (!input.editable) return {
    kind: "readonly",
    key: input.key,
    label: input.label,
    value: input.positionName ? `${input.positionName} · ${input.departmentName}` : "未选择",
  };
  return {
    key: input.key,
    label: input.label,
    value: input.positionId ? String(input.positionId) : "",
    required: true,
    placeholder: input.positions.length > 0 ? "选择部门范围内岗位" : "当前部门范围内没有现用岗位",
    hint: "仅可选择填写人所在部门及其下级部门的现用岗位",
    spec: {
      valueType: "string",
      control: "choice",
      options: {
        source: "static",
        items: input.positions.map((position) => ({
          value: String(position.positionId),
          label: position.positionName,
          description: `${position.departmentCode} · ${position.departmentName}`,
        })),
      },
      state: input.positions.length > 0 ? "normal" : "disabled",
    },
    onChange: (value) => input.onSelect(input.positions.find((position) => position.positionId === Number(value)) ?? null),
  };
}

const RECOMMENDATION_LABELS = {
  process_redesign: "先统一流程与口径",
  erp_workflow: "优先 ERP/工作流数字化",
  deterministic_automation: "适合规则自动化",
  agent_assist: "适合 Agent 辅助",
  agent_with_review: "适合 Agent + 人工复核",
  observe: "暂不列为优先机会",
} as const;

export function processItems(
  draft: ErpDiligenceDraft,
  setDraft: DraftSetter,
  editable: boolean,
  responsibilityPositions: readonly ErpDiligenceResponsibilityPositionOption[] = [],
): FormSurfaceItemSpec[] {
  const update = (key: string, patch: Partial<ErpDiligenceProcessStep>) => setDraft((current) => ({
    ...current,
    processSteps: current.processSteps.map((step) => step.key === key ? { ...step, ...patch } : step),
  }));
  return [{
    kind: "repeatable",
    key: "processSteps",
    title: "流程活动诊断",
    subtitle: "一条记录一个实际活动。通过频率、耗时、等待、数据形态、规则、例外和风险，自动判断数字化与 Agent 机会。",
    empty: "还没有流程活动。先新增一个你最熟悉、最耗时或最易出错的活动。",
    layout: { columns: 2 },
    addAction: editable ? {
      key: "add-step",
      label: "新增步骤",
      icon: "add",
      onClick: () => setDraft((current) => ({ ...current, processSteps: [...current.processSteps, newProcessStep()] })),
    } : undefined,
    items: draft.processSteps.map((step, index) => ({
      key: step.key,
      title: `活动 ${index + 1}${step.activityKey ? ` · ${ERP_DILIGENCE_PROCESS_ACTIVITY_OPTIONS.find((option) => option.value === step.activityKey)?.label ?? step.activityKey}` : ""}`,
      actions: editable ? [{
        key: `remove-${step.key}`,
        label: "删除",
        icon: "delete",
        variant: "danger",
        onClick: () => setDraft((current) => ({ ...current, processSteps: current.processSteps.filter((item) => item.key !== step.key) })),
      }] : undefined,
      items: ((): FormSurfaceItemSpec[] => {
        const score = calculateErpDiligenceOpportunity(step);
        return [
          choiceItem({ key: `${step.key}-activity`, label: "流程活动", value: step.activityKey, options: ERP_DILIGENCE_PROCESS_ACTIVITY_OPTIONS, editable, required: true, onChange: (value) => update(step.key, { activityKey: String(value ?? "") }) }),
          responsibilityItem({ key: `${step.key}-owner`, label: "责任岗位", positionId: step.ownerPositionId, positionName: step.ownerPositionName, departmentName: step.ownerDepartmentName, positions: responsibilityPositions, editable, onSelect: (position) => update(step.key, { ownerPositionId: position?.positionId ?? null, ownerPositionName: position?.positionName ?? "", ownerDepartmentName: position?.departmentName ?? "" }) }),
          choiceItem({ key: `${step.key}-frequency`, label: "发生频率", value: step.frequency, options: ERP_DILIGENCE_FREQUENCY_OPTIONS, editable, onChange: (value) => update(step.key, { frequency: String(value ?? "") }) }),
          choiceItem({ key: `${step.key}-volume`, label: "业务量", value: step.volumeBand, options: ERP_DILIGENCE_VOLUME_OPTIONS, editable, onChange: (value) => update(step.key, { volumeBand: String(value ?? "") }) }),
          choiceItem({ key: `${step.key}-touch`, label: "单笔人工耗时", value: step.touchTimeBand, options: ERP_DILIGENCE_TIME_OPTIONS, editable, onChange: (value) => update(step.key, { touchTimeBand: String(value ?? "") }) }),
          choiceItem({ key: `${step.key}-wait`, label: "平均等待时间", value: step.waitTimeBand, options: ERP_DILIGENCE_WAIT_OPTIONS, editable, onChange: (value) => update(step.key, { waitTimeBand: String(value ?? "") }) }),
          choiceItem({ key: `${step.key}-execution`, label: "当前执行方式", value: step.executionMode, options: ERP_DILIGENCE_EXECUTION_MODE_OPTIONS, editable, onChange: (value) => update(step.key, { executionMode: String(value ?? "") }) }),
          choiceItem({ key: `${step.key}-input`, label: "主要输入形态", value: step.inputStructure, options: ERP_DILIGENCE_INPUT_STRUCTURE_OPTIONS, editable, onChange: (value) => update(step.key, { inputStructure: String(value ?? "") }) }),
          choiceItem({ key: `${step.key}-rules`, label: "规则/判断方式", value: step.ruleType, options: ERP_DILIGENCE_RULE_TYPE_OPTIONS, editable, onChange: (value) => update(step.key, { ruleType: String(value ?? "") }) }),
          choiceItem({ key: `${step.key}-variability`, label: "流程变化程度", value: step.variability, options: ERP_DILIGENCE_VARIABILITY_OPTIONS, editable, onChange: (value) => update(step.key, { variability: String(value ?? "") }) }),
          choiceItem({ key: `${step.key}-exceptions`, label: "例外/返工比例", value: step.exceptionRate, options: ERP_DILIGENCE_RATE_OPTIONS, editable, onChange: (value) => update(step.key, { exceptionRate: String(value ?? "") }) }),
          choiceItem({ key: `${step.key}-errors`, label: "差错比例", value: step.errorRate, options: ERP_DILIGENCE_RATE_OPTIONS, editable, onChange: (value) => update(step.key, { errorRate: String(value ?? "") }) }),
          choiceItem({ key: `${step.key}-handoff`, label: "交接方式", value: step.handoffMode, options: ERP_DILIGENCE_HANDOFF_OPTIONS, editable, onChange: (value) => update(step.key, { handoffMode: String(value ?? "") }) }),
          choiceItem({ key: `${step.key}-systems`, label: "涉及系统数", value: step.systemCount, options: ERP_DILIGENCE_SYSTEM_COUNT_OPTIONS, editable, onChange: (value) => update(step.key, { systemCount: String(value ?? "") }) }),
          choiceItem({ key: `${step.key}-logs`, label: "可追踪数据", value: step.logAvailability, options: ERP_DILIGENCE_LOG_OPTIONS, editable, onChange: (value) => update(step.key, { logAvailability: String(value ?? "") }) }),
          choiceItem({ key: `${step.key}-risk`, label: "执行风险", value: step.riskLevel, options: ERP_DILIGENCE_RISK_OPTIONS, editable, onChange: (value) => update(step.key, { riskLevel: String(value ?? "") }) }),
          choiceItem({ key: `${step.key}-review`, label: "人工复核要求", value: step.reviewRequirement, options: ERP_DILIGENCE_REVIEW_OPTIONS, editable, onChange: (value) => update(step.key, { reviewRequirement: String(value ?? "") }) }),
          choiceItem({ key: `${step.key}-pain`, label: "主要痛点", value: step.painPoints, options: ERP_DILIGENCE_PAIN_POINT_OPTIONS, editable, multiple: true, onChange: (value) => update(step.key, { painPoints: Array.isArray(value) ? value.map(String) : [] }) }),
          { kind: "readonly", key: `${step.key}-digitization`, label: "数字化潜力", value: `${score.digitizationScore} / 100` },
          { kind: "readonly", key: `${step.key}-agent`, label: "Agent 潜力", value: `${score.agentScore} / 100 · ${RECOMMENDATION_LABELS[score.recommendation]}` },
          textField({ key: `${step.key}-notes`, label: "例外说明（可选）", value: step.notes, editable, multiline: true, span: "wide", placeholder: "只补充选项无法表达的特殊规则或典型案例", onChange: (value) => update(step.key, { notes: value }) }),
        ];
      })(),
    })),
  }];
}

export function evidenceItems(
  draft: ErpDiligenceDraft,
  setDraft: DraftSetter,
  editable: boolean,
  responsibilityPositions: readonly ErpDiligenceResponsibilityPositionOption[] = [],
  attachmentActions?: {
    busyEvidenceKey: string | null;
    onUpload?: (evidenceKey: string, file: File) => void | Promise<void>;
    onDownload: (attachment: ErpDiligenceEvidenceAttachment) => void;
    onDelete?: (attachment: ErpDiligenceEvidenceAttachment) => void | Promise<void>;
  },
): FormSurfaceItemSpec[] {
  const update = (key: string, patch: Partial<ErpDiligenceEvidenceItem>) => setDraft((current) => ({
    ...current,
    evidenceItems: current.evidenceItems.map((item) => item.key === key ? { ...item, ...patch } : item),
  }));
  return [{
    kind: "repeatable",
    key: "evidenceItems",
    title: "样表与材料",
    subtitle: "可直接上传脱敏后的样表、台账或流程材料；外部系统中的原件仍可补充存放位置或链接。",
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
        choiceItem({ key: `${item.key}-documentType`, label: "材料类型", value: item.documentType, options: ERP_DILIGENCE_EVIDENCE_TYPES, editable, required: true, onChange: (value) => update(item.key, { documentType: String(value ?? "") }) }),
        responsibilityItem({ key: `${item.key}-owner`, label: "材料负责人岗位", positionId: item.ownerPositionId, positionName: item.ownerPositionName, departmentName: item.ownerDepartmentName, positions: responsibilityPositions, editable, onSelect: (position) => update(item.key, { ownerPositionId: position?.positionId ?? null, ownerPositionName: position?.positionName ?? "", ownerDepartmentName: position?.departmentName ?? "" }) }),
        choiceItem({ key: `${item.key}-format`, label: "材料格式", value: item.format, options: ERP_DILIGENCE_EVIDENCE_FORMAT_OPTIONS, editable, onChange: (value) => update(item.key, { format: String(value ?? "") }) }),
        choiceItem({ key: `${item.key}-update`, label: "更新频率", value: item.updateFrequency, options: ERP_DILIGENCE_EVIDENCE_UPDATE_OPTIONS, editable, onChange: (value) => update(item.key, { updateFrequency: String(value ?? "") }) }),
        choiceItem({ key: `${item.key}-completeness`, label: "完整性", value: item.completeness, options: ERP_DILIGENCE_EVIDENCE_COMPLETENESS_OPTIONS, editable, onChange: (value) => update(item.key, { completeness: String(value ?? "") }) }),
        textField({ key: `${item.key}-sampleLocation`, label: "存放位置/链接", value: item.sampleLocation, editable, span: "wide", placeholder: "例如：共享盘路径、系统菜单或文档链接", onChange: (value) => update(item.key, { sampleLocation: value }) }),
        ...(!editable || !attachmentActions?.onUpload ? [] : [{
          key: `${item.key}-upload`,
          label: "上传样表/材料",
          hint: item.documentType ? "支持 PDF、Office、CSV、文本和常用图片；单个不超过 20 MB" : "请先选择材料类型",
          accept: ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.png,.jpg,.jpeg,.webp",
          span: "wide" as const,
          spec: {
            valueType: "file" as const,
            control: "file" as const,
            state: !item.documentType || attachmentActions.busyEvidenceKey === item.key ? "disabled" as const : "normal" as const,
          },
          onChange: (value: unknown) => {
            if (value instanceof File) void attachmentActions.onUpload?.(item.key, value);
          },
        }]),
        ...(item.attachments ?? []).map((attachment, attachmentIndex): FormSurfaceItemSpec => ({
          key: `${item.key}-attachment-${attachment.attachmentUid}`,
          label: `已上传附件 ${attachmentIndex + 1}`,
          value: `${attachment.fileName} · ${attachmentSize(attachment.fileSize)}`,
          span: "wide",
          spec: { valueType: "string", control: "text", state: "readonly" },
          actions: [
            ...(attachmentActions ? [{
              key: `download-${attachment.attachmentUid}`,
              label: "下载",
              icon: "download" as const,
              onClick: () => attachmentActions.onDownload(attachment),
            }] : []),
            ...(editable && attachmentActions?.onDelete ? [{
              key: `delete-${attachment.attachmentUid}`,
              label: "删除",
              icon: "delete" as const,
              variant: "danger" as const,
              disabled: attachmentActions.busyEvidenceKey === item.key,
              onClick: () => void attachmentActions.onDelete?.(attachment),
            }] : []),
          ],
        })),
        textField({ key: `${item.key}-notes`, label: "说明（可选）", value: item.notes, editable, multiline: true, span: "wide", onChange: (value) => update(item.key, { notes: value }) }),
      ],
    })),
  }];
}
