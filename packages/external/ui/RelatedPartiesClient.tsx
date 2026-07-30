"use client";

import { useState } from "react";
import {
  PageSurface,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  useFeedback,
  type DataSurfaceColumnSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import type { ExternalRelatedParty, ExternalPartyRelatedPartyType } from "@workspace/external/types";
import { EXTERNAL_PARTY_RELATED_PARTY_LABELS } from "./external-party-form";
import {
  emptyRelatedPartyCreateDraft,
  relatedPartyCreateSections,
  type RelatedPartyCreateDraft,
} from "./related-party-form";
import { useRelatedParties, useRelatedPartyCandidates } from "./useRelatedParties";

const RELATED_TYPES = [
  "group",
  "joint_venture_associate",
  "investor_influence",
  "key_management_related",
  "other_related",
] as const satisfies readonly ExternalPartyRelatedPartyType[];

const RELATED_PARTY_TONES = {
  unrelated: "slate",
  group: "amber",
  joint_venture_associate: "emerald",
  investor_influence: "orange",
  key_management_related: "sky",
  other_related: "slate",
} as const satisfies Record<ExternalPartyRelatedPartyType, "slate" | "amber" | "emerald" | "orange" | "sky">;

const columns: DataSurfaceColumnSpec<ExternalRelatedParty>[] = [
  {
    key: "name",
    label: "名称",
    required: true,
    width: "lg",
    cell: (row) => ({
      kind: "stack",
      gap: "xs",
      items: [
        { kind: "text", value: row.name, title: row.name, emphasis: "medium", wrap: "truncate" },
        ...(row.fullName && row.fullName !== row.name
          ? [{ kind: "text" as const, value: row.fullName, title: row.fullName, tone: "muted" as const, wrap: "truncate" as const }]
          : []),
      ],
    }),
  },
  {
    key: "subjectType",
    label: "主体类型",
    defaultVisible: true,
    width: "xs",
    tone: "muted",
    wrap: "nowrap",
    cell: (row) => row.subjectType === "individual" ? "个人" : "单位",
  },
  {
    key: "relatedPartyType",
    label: "关系性质",
    required: true,
    width: "sm",
    wrap: "nowrap",
    cell: (row) => ({
      kind: "badge",
      label: EXTERNAL_PARTY_RELATED_PARTY_LABELS[row.relatedPartyType],
      tone: RELATED_PARTY_TONES[row.relatedPartyType],
    }),
  },
  {
    key: "maintenance",
    label: "维护方式",
    defaultVisible: true,
    width: "sm",
    wrap: "nowrap",
    cell: (row) => ({ kind: "text", value: row.systemConfigured ? "系统配置" : "人工维护", tone: row.systemConfigured ? "info" : "muted" }),
  },
  {
    key: "identityNumber",
    label: "证件号 / 统一代码",
    defaultVisible: true,
    width: "lg",
    wrap: "truncate",
    cell: (row) => row.identityNumber
      ? { kind: "text", value: row.identityNumber, title: row.identityNumber, font: "mono", tone: "muted", wrap: "truncate", maxChars: 19 }
      : { kind: "empty" },
  },
  {
    key: "legalRepresentative",
    label: "法定代表人",
    defaultVisible: true,
    width: "sm",
    wrap: "truncate",
    cell: (row) => row.legalRepresentative
      ? { kind: "text", value: row.legalRepresentative, title: row.legalRepresentative, wrap: "truncate" }
      : { kind: "empty" },
  },
];

export default function RelatedPartiesClient({ canCreate, canDelete }: { canCreate: boolean; canDelete: boolean }) {
  const data = useRelatedParties();
  const feedback = useFeedback();
  const [createDraft, setCreateDraft] = useState<RelatedPartyCreateDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const candidates = useRelatedPartyCandidates(Boolean(createDraft), data.asOfDate);

  function updateCreateDraft<K extends keyof RelatedPartyCreateDraft>(key: K, value: RelatedPartyCreateDraft[K]) {
    setCreateDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function saveCreate() {
    if (!createDraft?.partyId || !createDraft.relatedPartyType) return;
    const candidate = candidates.items.find((item) => item.id === createDraft.partyId);
    if (!candidate) return feedback.error("请选择客户或供应商");
    setSaving(true);
    try {
      const result = await data.create(candidate, createDraft.relatedPartyType);
      if (!result.ok) return feedback.error(result.error);
      feedback.success("关联方已登记");
      setCreateDraft(null);
    } finally {
      setSaving(false);
    }
  }

  async function removeRelatedParty(row: ExternalRelatedParty) {
    const confirmed = await feedback.confirmDelete({
      message: `确定取消“${row.name}”的关联方标记吗？客户、供应商及主体资料都会保留。`,
    });
    if (!confirmed) return;
    setDeletingId(`${row.targetKind}:${row.id}`);
    try {
      const result = await data.remove(row);
      if (!result.ok) return feedback.error(result.error);
      feedback.success("已取消关联方");
    } finally {
      setDeletingId(null);
    }
  }
  const toolbarItems: SurfaceToolbarItems = [
    { kind: "search", key: "search", value: data.keyword, onChange: data.setKeyword, placeholder: "搜索名称、统一代码或法定代表人", scope: ["名称", "统一代码", "法定代表人"] },
    {
      kind: "select",
      key: "related-party-type",
      label: "关系性质",
      value: data.relatedPartyType,
      options: [
        { value: "", label: "全部关系" },
        ...RELATED_TYPES.map((value) => ({ value, label: EXTERNAL_PARTY_RELATED_PARTY_LABELS[value] })),
      ],
      onChange: (value) => { data.setRelatedPartyType(value as ExternalPartyRelatedPartyType | ""); data.setPage(1); },
    },
    { kind: "period", key: "as-of-date", mode: "date", value: data.asOfDate || null, onChange: (value) => { data.setAsOfDate(value || ""); data.setPage(1); }, placeholder: "基准日" },
    { kind: "action-group", key: "actions", actions: [{ key: "refresh", kind: "refresh", label: "刷新", onClick: () => void data.load() }] },
    { kind: "text", key: "total", content: `共 ${data.total} 个关联方` },
  ];
  const sections = [
    {
      key: "related-party-create",
      body: {
        kind: "create" as const,
        create: {
          id: "external-related-party-create",
          trigger: "toolbar" as const,
          presentation: "block" as const,
          title: "新增关联方",
          open: Boolean(createDraft),
          canCreate,
          disabled: saving,
          content: {
            kind: "sections" as const,
            sections: relatedPartyCreateSections(
              createDraft ?? emptyRelatedPartyCreateDraft(),
              candidates.items,
              candidates.loading,
              candidates.error,
              updateCreateDraft,
            ),
          },
          submission: {
            action: "save" as const,
            disabled: saving || candidates.loading || !createDraft?.partyId || !createDraft.relatedPartyType,
            execute: saveCreate,
          },
          onOpenChange: (open: boolean) => setCreateDraft(open ? emptyRelatedPartyCreateDraft() : null),
          onCancel: () => setCreateDraft(null),
        },
      },
    },
    ...(data.error ? [createStatusSection("related-party-error", { kind: "error", content: data.error })] : []),
    ...(!data.error ? [createPageTableSection("related-party-directory", {
      rows: data.items,
      columns,
      visibleColumns: columns.map((column) => column.key),
      rowKey: (row) => `${row.targetKind}:${row.id}`,
      loading: data.loading,
      emptyText: "当前条件下没有关联方",
      presentation: {
        density: "compact",
        grid: "rows",
        header: "tinted",
        rowHover: "neutral",
        stripe: "subtle",
        cellWrap: "nowrap",
      },
      rowActions: canDelete ? (row) => row.systemConfigured ? [] : [{
        key: "delete",
        kind: "delete",
        label: "取消关联方",
        disabled: deletingId === `${row.targetKind}:${row.id}`,
        onClick: () => void removeRelatedParty(row),
      }] : undefined,
      actionsColumn: canDelete ? { label: "操作" } : undefined,
    })] : []),
  ];
  return <PageSurface
    kind="standard"
    toolbar={{ items: toolbarItems }}
    body={createPageBody(sections)}
    footer={data.total > 0 ? { pagination: { page: data.page, totalPages: data.totalPages, total: data.total, onPageChange: data.setPage } } : undefined}
  />;
}
