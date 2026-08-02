import {
  createFieldsSection,
  createMasterDetailBody,
  createMessageSection,
  createPageBody,
  createPanelSection,
  createStatusSection,
  type BodySurfaceProps,
  type FormSurfaceItemSpec,
} from "@workspace/core/ui";
import type {
  BusinessRequiredPolicy,
  RelationPolicyPreset,
} from "@workspace/platform/relation-registration-contract";

import type { DatabaseSchemaModule } from "../../../database-schema-contract";
import type {
  RelationPolicyCatalog,
  RelationPolicyCatalogItem,
} from "../../../relation-policy-contract";
import { DELETE_ACTION_LABEL } from "./DatabaseRelationsTabModel";
import {
  BUSINESS_REQUIRED_LABELS,
  DELETE_LINKAGE_LABELS,
  businessRequiredLabel,
  deleteLinkageLabel,
  relationPolicyDraftChanged,
  relationPolicyDraftValid,
  relationPolicyHasEditableField,
  relationPolicyIdentity,
  relationPolicyInvalidMessages,
  relationPolicyModuleKeyFromTreeKey,
  relationPolicyModuleTreeKey,
  relationPolicyRelationTreeKey,
  relationPolicyTreeItems,
  type RelationPolicyDraft,
  type RelationPolicyTreeValue,
} from "./DatabaseRelationsTabPolicyModel";

interface RelationPolicyBodyInput {
  catalog: RelationPolicyCatalog | null;
  schemaModules: readonly DatabaseSchemaModule[];
  loading: boolean;
  selectedRelation: RelationPolicyCatalogItem | null;
  draft: RelationPolicyDraft | null;
  reason: string;
  saving: boolean;
  expandedModuleKeys: readonly string[];
  mobileDetailActive: boolean;
  onSelectRelation: (relationKey: string) => void;
  onOpenModule: (moduleKey: string) => void;
  onToggleModule: (moduleKey: string, expanded: boolean) => void;
  onDraftChange: <K extends keyof RelationPolicyDraft>(
    field: K,
    value: NonNullable<RelationPolicyDraft[K]>,
  ) => void;
  onReasonChange: (value: string) => void;
  onNavigateToList: () => void;
  onSave: () => void;
  onReset: () => void;
}

function deleteLinkageField(
  relation: RelationPolicyCatalogItem,
  draft: RelationPolicyDraft,
  saving: boolean,
  onChange: (value: RelationPolicyPreset) => void,
): FormSurfaceItemSpec {
  const field = relation.deleteLinkage;
  const stale = Boolean(relation.policyGroup?.stale);
  if (field.mode !== "editable" || stale) {
    const invalid = field.mode === "invalid" || stale;
    return {
      kind: "readonly",
      key: "targetDelete",
      label: "删除联动",
      value: deleteLinkageLabel(field.effective),
      span: "wide",
      hint: invalid
        ? undefined
        : field.reason || "由业务规则固定，不能在此调整",
      error: stale
        ? "系统预设已更新，请刷新后复核。"
        : field.mode === "invalid"
          ? field.reason || "未找到删除联动规则，当前关系不能调整。"
          : undefined,
    };
  }
  const allowedLabels = field.allowed.map((value) => DELETE_LINKAGE_LABELS[value]);
  return {
    key: "targetDelete",
    label: "删除联动",
    required: true,
    span: "wide",
    choiceName: `relation-delete-${relation.relationKey}`,
    spec: {
      valueType: "string",
      control: "choice",
      presentation: "choice",
      state: saving ? "disabled" : "normal",
      validation: { required: true },
      options: {
        source: "static",
        items: allowedLabels.map((label) => ({ value: label, label })),
      },
    },
    value: draft.targetDelete ? DELETE_LINKAGE_LABELS[draft.targetDelete] : "",
    hint: `系统预设：${deleteLinkageLabel(field.baseline)}`,
    error: draft.targetDelete ? undefined : "请选择删除联动规则",
    onChange: (value: unknown) => {
      const selected = field.allowed.find((candidate) => (
        DELETE_LINKAGE_LABELS[candidate] === String(value ?? "")
      ));
      if (selected) onChange(selected);
    },
  };
}

function businessRequiredField(
  relation: RelationPolicyCatalogItem,
  draft: RelationPolicyDraft,
  saving: boolean,
  onChange: (value: BusinessRequiredPolicy) => void,
): FormSurfaceItemSpec {
  const field = relation.businessRequired;
  const stale = Boolean(relation.policyGroup?.stale);
  if (field.mode !== "editable" || stale) {
    const invalid = field.mode === "invalid" || stale;
    return {
      kind: "readonly",
      key: "businessRequired",
      label: "业务必填",
      value: businessRequiredLabel(field.effective),
      span: "wide",
      hint: invalid
        ? undefined
        : field.reason || "由业务规则固定，不能在此调整",
      error: stale
        ? "系统预设已更新，请刷新后复核。"
        : field.mode === "invalid"
          ? field.reason || "未找到业务必填规则，不能从数据库可空性推断。"
          : undefined,
    };
  }
  const allowedLabels = field.allowed.map((value) => BUSINESS_REQUIRED_LABELS[value]);
  return {
    key: "businessRequired",
    label: "业务必填",
    required: true,
    span: "wide",
    choiceName: `relation-required-${relation.relationKey}`,
    spec: {
      valueType: "string",
      control: "choice",
      presentation: "choice",
      state: saving ? "disabled" : "normal",
      validation: { required: true },
      options: {
        source: "static",
        items: allowedLabels.map((label) => ({ value: label, label })),
      },
    },
    value: draft.businessRequired ? BUSINESS_REQUIRED_LABELS[draft.businessRequired] : "",
    hint: `系统预设：${businessRequiredLabel(field.baseline)}`,
    error: draft.businessRequired ? undefined : "请选择业务必填规则",
    onChange: (value: unknown) => {
      const selected = field.allowed.find((candidate) => (
        BUSINESS_REQUIRED_LABELS[candidate] === String(value ?? "")
      ));
      if (selected) onChange(selected);
    },
  };
}

function physicalEvidenceSection(relation: RelationPolicyCatalogItem) {
  const evidence = relation.physicalEvidence;
  const sections = evidence
    ? [createFieldsSection("relation-policy-physical-evidence-fields", [
        {
          kind: "readonly",
          key: "constraintName",
          label: "外键约束",
          value: evidence.constraintName,
          fontRole: "mono",
          span: "wide",
        },
        {
          kind: "readonly",
          key: "sourceColumns",
          label: "引用字段",
          value: `${evidence.sourceTable}.${evidence.sourceColumns.join(", ")}`,
          fontRole: "mono",
          span: "wide",
        },
        {
          kind: "readonly",
          key: "targetColumns",
          label: "目标字段",
          value: `${evidence.targetTable}.${evidence.targetColumns.join(", ")}`,
          fontRole: "mono",
          span: "wide",
        },
        {
          kind: "readonly",
          key: "databaseOnDelete",
          label: "数据库删除动作",
          value: DELETE_ACTION_LABEL[evidence.onDelete],
        },
        {
          kind: "readonly",
          key: "databaseNullable",
          label: "数据库允许空值",
          value: evidence.sourceRequired ? "否" : "是",
        },
      ], {
        layout: { columns: 2, density: "compact" },
      })]
    : [createMessageSection("relation-policy-physical-evidence-empty", {
        content: relation.orphanPhysical
          ? "数据库证据与关系声明无法唯一对应，已停止编辑。"
          : relation.semantics === "virtual"
            ? "该业务关系不对应物理外键。"
            : "未发现可核对的数据库外键。",
        tone: relation.orphanPhysical ? "warning" : "muted",
      })];
  return createPanelSection("relation-policy-physical-evidence", {
    title: "数据库证据",
    sections,
  });
}

function sharedPolicyMessage(
  catalog: RelationPolicyCatalog,
  relation: RelationPolicyCatalogItem,
) {
  const memberKeys = relation.policyGroup?.relationKeys ?? [];
  if (memberKeys.length <= 1) return null;
  const relationByKey = new Map(catalog.relations.map((item) => [item.relationKey, item]));
  const memberLabels = memberKeys.map((key) => {
    const item = relationByKey.get(key);
    return item
      ? `${item.title}（${item.source.label?.trim() || item.source.entity}）`
      : key;
  });
  const visibleLabels = memberLabels.slice(0, 4);
  const suffix = memberLabels.length > visibleLabels.length
    ? ` 等 ${memberLabels.length} 项关系`
    : "";
  return `此关系规则由 ${memberLabels.length} 项关系共用，保存会同步应用于：${visibleLabels.join("、")}${suffix}。`;
}

function relationPolicyDetailSections(input: RelationPolicyBodyInput) {
  const relation = input.selectedRelation;
  const draft = input.draft;
  if (!relation || !draft || !input.catalog) {
    return [createStatusSection("relation-policy-detail-empty", {
      kind: "empty",
      content: "请从左侧选择一项业务关系",
    })];
  }

  const canSave = relationPolicyHasEditableField(relation);
  const canReset = Boolean(
    relation.policyGroup
    && (relation.policyGroup.overridden || relation.policyGroup.stale),
  );
  const reasonMissing = !input.reason.trim();
  const items: FormSurfaceItemSpec[] = [
    deleteLinkageField(
      relation,
      draft,
      input.saving,
      (value) => input.onDraftChange("targetDelete", value),
    ),
    businessRequiredField(
      relation,
      draft,
      input.saving,
      (value) => input.onDraftChange("businessRequired", value),
    ),
    ...((canSave || canReset) ? [{
      key: "reason",
      label: "调整原因",
      required: true,
      span: "wide" as const,
      spec: {
        valueType: "string" as const,
        control: "text" as const,
        multiline: true,
        state: input.saving ? "disabled" as const : "normal" as const,
        validation: { required: true },
      },
      value: input.reason,
      rows: 3,
      maxLength: 500,
      placeholder: "说明为什么需要调整该关系规则",
      onChange: (value: unknown) => input.onReasonChange(String(value ?? "")),
    }] : []),
    {
      kind: "note",
      key: "relation-policy-boundary",
      content: "按业务关系维护删除时的联动处理和表单必填规则。数据库外键只用于核对，不在这里修改。",
    },
  ];

  const sharedMessage = sharedPolicyMessage(input.catalog, relation);
  const invalidMessages = relationPolicyInvalidMessages(relation);
  return [
    createFieldsSection("relation-policy-editor", items, {
      layout: { columns: 2, density: "compact" },
      header: {
        title: relation.title,
        description: relationPolicyIdentity(relation),
      },
      actions: [
        ...(canSave ? [{
          key: "save-relation-policy",
          action: "save" as const,
          label: input.saving ? "保存中..." : "保存关系规则",
          disabled: input.saving
            || reasonMissing
            || !relationPolicyDraftValid(relation, draft)
            || !relationPolicyDraftChanged(relation, draft),
          onClick: input.onSave,
        }] : []),
        ...(canReset ? [{
          key: "reset-relation-policy",
          action: "reset" as const,
          label: "恢复系统预设",
          disabled: input.saving || reasonMissing,
          onClick: input.onReset,
        }] : []),
      ],
    }),
    ...(sharedMessage ? [createMessageSection("relation-policy-shared-group", {
      content: sharedMessage,
      tone: "default",
    })] : []),
    ...invalidMessages.map((message, index) => createMessageSection(
      `relation-policy-issue-${index}`,
      { content: message, tone: "warning" },
    )),
    physicalEvidenceSection(relation),
  ];
}

export function createRelationPolicyBody(input: RelationPolicyBodyInput): BodySurfaceProps {
  if (!input.catalog) {
    return createPageBody([createStatusSection("relation-policy-status", {
      kind: input.loading ? "loading" : "empty",
      content: input.loading ? "正在读取关系规则" : "暂无关系规则",
    })]);
  }

  return createMasterDetailBody({
    master: {
      label: "业务关系",
      presentation: "compact",
      body: {
        kind: "selector",
        selector: {
          kind: "tree",
          title: "模块与关系",
          selectedId: input.selectedRelation
            ? relationPolicyRelationTreeKey(input.selectedRelation.relationKey)
            : null,
          expandedIds: input.expandedModuleKeys.map(relationPolicyModuleTreeKey),
          items: relationPolicyTreeItems(input.catalog, input.schemaModules),
          emptyText: "暂无业务关系",
          collapsible: true,
          onSelect: (item: RelationPolicyTreeValue) => {
            if (item.kind === "relation") input.onSelectRelation(item.relationKey);
            else input.onOpenModule(item.moduleKey);
          },
          onToggle: (treeKey, expanded) => {
            const moduleKey = relationPolicyModuleKeyFromTreeKey(treeKey);
            if (moduleKey) input.onToggleModule(moduleKey, expanded);
          },
        },
      },
    },
    detail: createPageBody(relationPolicyDetailSections(input)),
    desktop: { ratio: [3, 7] },
    mobile: {
      detailActive: input.mobileDetailActive,
      onNavigateToList: input.onNavigateToList,
    },
  });
}
