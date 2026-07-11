"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createEmptySection,
  createFieldsSection,
  createMetricsSection,
  createPageBody,
  createPanelSection,
  PageSurface,
  setSelectorTreeNodeExpanded,
  useFeedback,
  type BodySurfaceSectionSpec,
  type CreateSurfaceProps,
  type CreateSurfaceSectionSpec,
  type FormSurfaceItemSpec,
  type SelectorSurfaceProps,
  type SelectorSurfaceStructuredTreeItemSpec,
} from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import { postJson, putJson, requestJson } from "@workspace/platform/ui/api-client";
import {
  useDepartmentDescriptionCreateSections,
  useDepartmentDescriptionsSection,
  type OrganizationUnitDescriptionDraft,
} from "@workspace/platform/ui/organization-units";
import type { GovernanceOrganization, GovernancePositionSummary } from "../types";
import {
  createDescriptionDraft,
  descriptionDraftsFromOrganization,
  descriptionPayload,
  normalizeDescriptionsForCompare,
} from "./governance-descriptions";
import {
  buildGovernanceTree,
  formatGovernanceAlias,
  governanceTreeExpandedIds,
  renderGovernanceTreeItem,
  serializeGovernanceAlias,
  splitGovernanceAlias,
  type GovernanceTreeNode,
} from "./governance-selector";

type GovernanceResponse = {
  organizations: GovernanceOrganization[];
  positions: GovernancePositionSummary[];
};

type Selection =
  | { type: "organization"; id: number }
  | { type: "position"; id: number }
  | { type: "new"; parentId: number | null }
  | null;

type OrganizationDraft = {
  id: number | null;
  code: string;
  name: string;
  alias: string;
  parentId: number | null;
  managerPositionId: number | null;
  managerEmployeeIds: number[];
  managerEmployeeNames: string[];
  descriptions: OrganizationUnitDescriptionDraft[];
};

const ORGANIZATION_ENDPOINT = "/api/modules/capitalSecurities/governance/organizations";

function keyForSelection(selection: Selection) {
  if (!selection) return null;
  if (selection.type === "new") return "new";
  return `${selection.type}:${selection.id}`;
}

function draftFromOrganization(organization: GovernanceOrganization): OrganizationDraft {
  return {
    id: organization.id,
    code: organization.code,
    name: organization.name,
    alias: formatGovernanceAlias(organization.alias),
    parentId: organization.parentId,
    managerPositionId: organization.managerPositionId,
    managerEmployeeIds: organization.managerEmployeeIds,
    managerEmployeeNames: organization.managerEmployeeNames,
    descriptions: descriptionDraftsFromOrganization(organization),
  };
}

function newDraft(parentId: number | null): OrganizationDraft {
  return {
    id: null,
    code: "",
    name: "",
    alias: "",
    parentId,
    managerPositionId: null,
    managerEmployeeIds: [],
    managerEmployeeNames: [],
    descriptions: [createDescriptionDraft({ id: null, code: "", name: "" })],
  };
}

function descendantOrganizationIds(
  organizationId: number,
  organizations: GovernanceOrganization[],
) {
  const childrenByParent = new Map<number | null, number[]>();
  for (const organization of organizations) {
    const list = childrenByParent.get(organization.parentId) ?? [];
    list.push(organization.id);
    childrenByParent.set(organization.parentId, list);
  }
  const result = new Set<number>();
  function visit(id: number) {
    for (const childId of childrenByParent.get(id) ?? []) {
      if (result.has(childId)) continue;
      result.add(childId);
      visit(childId);
    }
  }
  visit(organizationId);
  return result;
}

export default function GovernanceArchitectureClient({
  canCreate,
  canUpdate,
}: {
  canCreate: boolean;
  canUpdate: boolean;
}) {
  const feedback = useFeedback();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<GovernanceResponse>({ organizations: [], positions: [] });
  const [selection, setSelection] = useState<Selection>(null);
  const [draft, setDraft] = useState<OrganizationDraft | null>(null);
  const [sideOpen, setSideOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsedTreeNodeIds, setCollapsedTreeNodeIds] = useState<Set<string>>(() => new Set());

  const organizationsById = useMemo(
    () => new Map(data.organizations.map((organization) => [organization.id, organization])),
    [data.organizations],
  );
  const positionsById = useMemo(
    () => new Map(data.positions.map((position) => [position.id, position])),
    [data.positions],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await requestJson<GovernanceResponse>(ORGANIZATION_ENDPOINT, {
        fallbackMessage: "读取治理架构失败",
      });
      setData(response);
      setSelection((current) => current ?? (response.organizations[0] ? { type: "organization", id: response.organizations[0].id } : null));
    } catch (error) {
      feedback.notify(error instanceof Error ? error.message : "读取治理架构失败", "error");
    } finally {
      setLoading(false);
    }
  }, [feedback]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedOrganization = selection?.type === "organization" ? organizationsById.get(selection.id) : undefined;
  const selectedPosition = selection?.type === "position" ? positionsById.get(selection.id) : undefined;

  useEffect(() => {
    if (selection?.type === "organization" && selectedOrganization) {
      setDraft(draftFromOrganization(selectedOrganization));
    } else if (selection?.type === "new") {
      setDraft(newDraft(selection.parentId));
    } else {
      setDraft(null);
    }
  }, [selection, selectedOrganization]);

  const tree = useMemo(() => buildGovernanceTree(data.organizations, data.positions), [data.organizations, data.positions]);
  const expandedIds = useMemo(() => governanceTreeExpandedIds(data.organizations, collapsedTreeNodeIds), [collapsedTreeNodeIds, data.organizations]);
  const selectorItems = useMemo(() => {
    function declareItems(nodes: GovernanceTreeNode[], level = 1): SelectorSurfaceStructuredTreeItemSpec<GovernanceTreeNode>[] {
      return nodes.map((node) => ({
        key: `${node.kind}:${node.id}`,
        value: node,
        card: renderGovernanceTreeItem({ node, ctx: { level }, organizationsById, positionsById }),
        children: node.children?.length ? declareItems(node.children, level + 1) : undefined,
      }));
    }
    return declareItems(tree);
  }, [organizationsById, positionsById, tree]);
  const canEditOrganizationDraft = Boolean(draft && (draft.id ? canUpdate : canCreate));
  const departmentDescriptionDirty = Boolean(
    draft
    && selectedOrganization
    && normalizeDescriptionsForCompare(draft.descriptions) !== normalizeDescriptionsForCompare(descriptionDraftsFromOrganization(selectedOrganization)),
  );
  const departmentDescriptionsSection = useDepartmentDescriptionsSection({
    drafts: draft?.descriptions ?? [],
    dirty: departmentDescriptionDirty,
    canEditDepartment: canEditOrganizationDraft,
    onUpdateDraft: updateDescriptionDraft,
  });
  const departmentDescriptionCreateSections = useDepartmentDescriptionCreateSections({
    drafts: draft?.descriptions ?? [],
    dirty: false,
    canEditDepartment: canEditOrganizationDraft,
    onUpdateDraft: updateDescriptionDraft,
  });

  const selector: SelectorSurfaceProps<GovernanceTreeNode> = {
    kind: "tree",
    title: "G 线组织",
    items: selectorItems,
    loading,
    emptyText: "暂无 G 线组织",
    selectedId: keyForSelection(selection),
    expandedIds,
    onToggle: (id, expanded) => {
      setCollapsedTreeNodeIds((current) => setSelectorTreeNodeExpanded(current, String(id), expanded));
    },
    onSelect: (node) => setSelection(node.kind === "organization" ? { type: "organization", id: node.id } : { type: "position", id: node.id }),
  };

  function updateDraft<K extends keyof OrganizationDraft>(key: K, value: OrganizationDraft[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  function updateDescriptionDraft<K extends keyof OrganizationUnitDescriptionDraft>(index: number, key: K, value: OrganizationUnitDescriptionDraft[K]) {
    setDraft((current) => current ? {
      ...current,
      descriptions: current.descriptions.map((description, descriptionIndex) => descriptionIndex === index ? { ...description, [key]: value } : description),
    } : current);
  }

  async function saveDraft(options?: { surface?: boolean }) {
    if (!draft || saving || (draft.id ? !canUpdate : !canCreate)) return;
    if (!draft.code.trim() || !draft.name.trim()) {
      const error = new Error("请填写组织编码和名称");
      if (options?.surface) throw error;
      feedback.notify(error.message, "error");
      return;
    }
    const payload = {
      id: draft.id,
      code: draft.code,
      name: draft.name,
      alias: serializeGovernanceAlias(draft.alias),
      parentId: draft.parentId,
      managerPositionId: draft.managerPositionId,
      managerEmployeeIds: draft.managerEmployeeIds,
      descriptions: draft.descriptions.map(descriptionPayload),
    };
    setSaving(true);
    try {
      const response = draft.id
        ? await putJson<{ record: { id: number } }>(ORGANIZATION_ENDPOINT, payload, "保存治理组织失败")
        : await postJson<{ record: { id: number } }>(ORGANIZATION_ENDPOINT, payload, "新建治理组织失败");
      if (!options?.surface) feedback.notify(draft.id ? "治理组织已保存" : "治理组织已新建", "success");
      await load();
      setSelection({ type: "organization", id: response.record.id });
    } catch (error) {
      if (options?.surface) throw error;
      feedback.notify(error instanceof Error ? error.message : "保存治理组织失败", "error");
    } finally {
      setSaving(false);
    }
  }

  function organizationFormItems(): FormSurfaceItemSpec[] {
    if (!draft) return [];
    const selectedId = draft.id;
    const excludedIds = selectedId ? descendantOrganizationIds(selectedId, data.organizations).add(selectedId) : new Set<number>();
    const parentOptions = [
      { value: "", label: "无" },
      ...data.organizations
        .filter((organization) => !excludedIds.has(organization.id) && organization.level < 3)
        .map((organization) => ({ value: String(organization.id), label: `${organization.name}（${organization.code}）` })),
    ];
    const positionOptions = [
      { value: "", label: "无" },
      ...data.positions.map((position) => ({
        value: String(position.id),
        label: `${position.name}（${position.code}）`,
      })),
    ];
    const aliasTags = splitGovernanceAlias(draft.alias);
    const managerTags = draft.managerEmployeeIds.map((id, index) => ({
      id,
      name: draft.managerEmployeeNames[index] || String(id),
    }));
    const editable = canEditOrganizationDraft;
    const fields: FormSurfaceItemSpec[] = [
      { kind: "readonly", key: "hierarchyKind", label: "组织体系", value: "治理" },
      {
        key: "code",
        label: "组织编码",
        required: true,
        spec: { valueType: "string", control: "text", state: editable ? "normal" : "disabled" },
        value: draft.code,
        onChange: (value) => updateDraft("code", String(value ?? "").toUpperCase()),
      },
      {
        key: "name",
        label: "组织名称",
        required: true,
        spec: { valueType: "string", control: "text", state: editable ? "normal" : "disabled" },
        value: draft.name,
        onChange: (value) => updateDraft("name", String(value ?? "")),
      },
      {
        key: "parent",
        label: "上级组织",
        spec: {
          valueType: "reference",
          control: "choice",
          state: editable ? "normal" : "disabled",
          options: { source: "static", items: parentOptions },
        },
        value: draft.parentId == null ? "" : String(draft.parentId),
        placeholder: "无",
        onChange: (value) => updateDraft("parentId", value === "" ? null : Number(value)),
      },
      {
        kind: "tagList",
        key: "alias",
        label: "别名",
        span: "wide",
        items: aliasTags,
        getKey: (tag, index) => `${tag}-${index}`,
        getLabel: (tag) => tag,
        onRemove: (_, index) => updateDraft("alias", aliasTags.filter((__, tagIndex) => tagIndex !== index).join("、")),
        onUpdateLabel: (_, index, next) => updateDraft("alias", aliasTags.map((tag, tagIndex) => tagIndex === index ? next : tag).join("、")),
        disabled: !editable,
        removeConfirmMessage: (tag) => `确定删除别名「${tag}」吗？删除后需要保存才会生效。`,
        shellClassName: "content-start",
        append: !editable ? undefined : {
          textInput: {
            key: "governanceAliasAppend",
            placeholder: aliasTags.length === 0 ? "添加别名" : "",
            onAppend: (values) => updateDraft("alias", [...aliasTags, ...values.flatMap(splitGovernanceAlias)].join("、")),
            onRemoveLast: () => {
              if (aliasTags.length > 0) updateDraft("alias", aliasTags.slice(0, -1).join("、"));
            },
          },
        },
      },
      {
        key: "managerPosition",
        label: "负责人岗位",
        spec: {
          valueType: "reference",
          control: "choice",
          state: editable ? "normal" : "disabled",
          options: { source: "static", items: positionOptions },
        },
        value: draft.managerPositionId == null ? "" : String(draft.managerPositionId),
        placeholder: "无",
        onChange: (value) => {
          updateDraft("managerPositionId", value === "" ? null : Number(value));
          updateDraft("managerEmployeeIds", []);
          updateDraft("managerEmployeeNames", []);
        },
      },
      {
        kind: "tagList",
        key: "managerEmployees",
        label: "组织负责人",
        span: "wide",
        items: managerTags,
        getKey: (item) => item.id,
        getLabel: (item) => item.name,
        onRemove: () => undefined,
        disabled: true,
        hint: "随负责人岗位的在岗人员派生；如需指定人员，请在 HR 任职关系中维护",
      },
    ];

    return fields;
  }

  function organizationSections(): BodySurfaceSectionSpec[] {
    if (!draft) return [];
    const currentOrg = draft.id ? organizationsById.get(draft.id) : undefined;
    return [
      createPanelSection("organization-info", {
        title: draft.id ? "组织信息" : "新建治理组织",
        sections: [
          createFieldsSection("fields", organizationFormItems(), {
            layout: { columns: 2 },
            actions: [{ key: "save", action: "save", label: saving ? "保存中..." : "保存", disabled: saving || (draft.id ? !canUpdate : !canCreate), onClick: () => void saveDraft() }],
          }),
          createMetricsSection("metrics", {
            metrics: [
              { key: "directPositions", label: "直属岗位", value: currentOrg?.directPositions ?? 0 },
              { key: "totalPositions", label: "总岗位", value: currentOrg?.totalPositions ?? 0 },
              { key: "directHeadcount", label: "直属编制", value: currentOrg?.directHeadcount ?? 0 },
              { key: "totalHeadcount", label: "总编制", value: currentOrg?.totalHeadcount ?? 0 },
            ],
          }),
          departmentDescriptionsSection,
        ],
      }),
    ];
  }

  function positionSections(): BodySurfaceSectionSpec[] {
    if (!selectedPosition) return [];
    const fields: FormSurfaceItemSpec[] = [
      { kind: "readonly", key: "code", label: "岗位编码", value: selectedPosition.code },
      { kind: "readonly", key: "name", label: "岗位名称", value: selectedPosition.name },
      { kind: "readonly", key: "department", label: "所属组织", value: selectedPosition.departmentName || "未归属" },
      { kind: "readonly", key: "headcount", label: "在岗人数", value: selectedPosition.headcount },
      { kind: "readonly", key: "description", label: "岗位说明书", value: selectedPosition.positionDescriptionName || "未关联" },
      { kind: "readonly", key: "reportTo", label: "汇报关系", value: selectedPosition.reportTo || "未维护" },
      { kind: "readonly", key: "managerOf", label: "负责人关系", value: selectedPosition.managerOfDepartmentIds.length ? `负责 ${selectedPosition.managerOfDepartmentIds.length} 个组织` : "无" },
    ];
    return [
      createPanelSection("position-info", {
        title: "岗位摘要",
        sections: [createFieldsSection("position-fields", fields, {
          layout: { columns: 2 },
          actions: [{ key: "open-hr", action: "open", label: "去 HR 维护岗位", onClick: () => { window.location.href = workspacePath("/hr/roster"); } }],
        })],
      }),
    ];
  }

  const sections = selection?.type === "position"
    ? positionSections()
    : selection?.type === "new" ? [] : organizationSections();

  const createSurface: CreateSurfaceProps = {
    id: "governance-organization-create",
    trigger: "toolbar",
    presentation: "block",
    title: "新建治理组织",
    open: selection?.type === "new",
    canCreate,
    disabled: saving,
    content: { kind: "sections", sections: selection?.type === "new" ? [
      { key: "organization-info", title: "组织信息", items: organizationFormItems(), layout: { columns: 2 } },
      ...departmentDescriptionCreateSections,
    ] satisfies CreateSurfaceSectionSpec[] : [] },
    submission: {
      action: "save",
      disabled: saving || !draft?.code.trim() || !draft?.name.trim(),
      execute: () => saveDraft({ surface: true }),
    },
    feedback: { saved: "治理组织已新建", error: "新建治理组织失败" },
    onOpenChange: (open) => {
      if (open) {
        const parentId = selectedOrganization && selectedOrganization.level < 3 ? selectedOrganization.id : null;
        setDraft(newDraft(parentId));
        setSelection({ type: "new", parentId });
        return;
      }
      setSelection((current) => current?.type === "new" ? null : current);
    },
  };

  const detailSections = sections.length > 0
    ? sections
    : [
      createEmptySection("empty", {
        presentation: "plain",
        content: loading ? "加载治理架构中" : "选择组织或岗位查看详情",
      }),
    ];
  const rightSections: BodySurfaceSectionSpec[] = [
    { key: "governance-organization-create", chrome: "plain", body: { kind: "create", create: createSurface } },
    ...(selection?.type === "new" ? [] : detailSections),
  ];

  return (
    <PageSurface kind="standard"
      body={{
        kind: "section",
        layout: "split",
        left: { kind: "selector", selector },
        drawerLeft: { kind: "selector", selector },
        right: createPageBody(rightSections),
        sideOpen,
        sideLabel: "治理组织",
        onSideOpenChange: setSideOpen,
        drawerOpen,
        onDrawerOpenChange: setDrawerOpen,
        showSideControls: false,
      }}
    />
  );
}
