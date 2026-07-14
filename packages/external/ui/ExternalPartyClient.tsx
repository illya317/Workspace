"use client";

import { useEffect, useState } from "react";
import {
  PageSurface,
  createBodySplitSection,
  createEmptySection,
  createFieldsSection,
  createPageBody,
  useFeedback,
  type SelectorSurfaceProps,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import type { ExternalParty, ExternalPartyCategory, ExternalPartyDraft } from "@workspace/external/types";
import {
  emptyExternalPartyDraft,
  EXTERNAL_PARTY_LABELS,
  EXTERNAL_PARTY_RELATED_PARTY_LABELS,
  externalPartyEditSections,
  externalPartyFormSections,
  type ExternalPartyDraftValue,
} from "./external-party-form";
import { useExternalParties } from "./useExternalParties";

interface ExternalPartyClientProps {
  category: ExternalPartyCategory;
  apiPath: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export default function ExternalPartyClient({ category, apiPath, canCreate, canUpdate, canDelete }: ExternalPartyClientProps) {
  const data = useExternalParties(apiPath);
  const labels = EXTERNAL_PARTY_LABELS[category];
  const [selected, setSelected] = useState<ExternalParty | null>(null);
  const [detailDraft, setDetailDraft] = useState<ExternalPartyDraft | null>(null);
  const [createDraft, setCreateDraft] = useState<ExternalPartyDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const feedback = useFeedback({ unsavedChanges: dirty });

  useEffect(() => {
    if (!selected && data.items[0]) {
      setSelected(data.items[0]);
      setDetailDraft({ ...data.items[0] });
      return;
    }
    if (!selected || dirty) return;
    const refreshed = data.items.find((item) => item.id === selected.id);
    if (refreshed && refreshed.version !== selected.version) {
      setSelected(refreshed);
      setDetailDraft({ ...refreshed });
    }
  }, [data.items, dirty, selected]);

  function updateCreateDraft(field: keyof ExternalPartyDraft, value: ExternalPartyDraftValue) {
    setCreateDraft((current) => current ? { ...current, [field]: value } : current);
  }

  function updateDetailDraft(field: keyof ExternalPartyDraft, value: ExternalPartyDraftValue) {
    if (!canUpdate) return;
    setDetailDraft((current) => current ? { ...current, [field]: value } : current);
    setDirty(true);
  }

  async function selectItem(item: ExternalParty) {
    if (item.id === selected?.id) {
      setDrawerOpen(false);
      return;
    }
    if (dirty && !await feedback.confirmLeave()) return;
    setSelected(item);
    setDetailDraft({ ...item });
    setDirty(false);
    setDrawerOpen(false);
  }

  async function saveCreate() {
    if (!createDraft) return;
    setSaving(true);
    try {
      const result = await data.save(createDraft);
      if (!result.ok) return feedback.error(result.error);
      feedback.success(`${labels.singular}信息已保存`);
      setCreateDraft(null);
      if (result.record) {
        setSelected(result.record);
        setDetailDraft({ ...result.record });
        setDirty(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveDetail() {
    if (!detailDraft || !selected) return;
    setSaving(true);
    try {
      const result = await data.save(detailDraft);
      if (!result.ok) return feedback.error(result.error);
      feedback.success(`${labels.singular}信息已保存`);
      if (result.record) {
        setSelected(result.record);
        setDetailDraft({ ...result.record });
      }
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  function resetDetail() {
    if (!selected) return;
    setDetailDraft({ ...selected });
    setDirty(false);
  }

  async function deleteSelected() {
    if (!selected) return;
    const confirmed = await feedback.confirmDelete({
      message: `确定删除“${selected.name}”吗？此操作不可撤销。`,
    });
    if (!confirmed) return;
    const removedId = selected.id;
    const result = await data.remove(selected);
    if (!result.ok) return feedback.error(result.error);
    const next = data.items.find((item) => item.id !== removedId) ?? null;
    setSelected(next);
    setDetailDraft(next ? { ...next } : null);
    setDirty(false);
    feedback.success("删除成功");
  }

  const selector: SelectorSurfaceProps<ExternalParty> = {
    kind: "list",
    title: `${labels.singular}目录`,
    selectedId: selected?.id ?? null,
    loading: data.loading,
    loadingText: "加载中...",
    emptyText: data.error ? `加载失败：${data.error}` : `暂无${labels.title}`,
    items: data.items.map((item) => ({
      key: item.id,
      value: item,
      group: EXTERNAL_PARTY_RELATED_PARTY_LABELS[item.relatedPartyType],
      card: {
        title: item.name,
        subtitle: item.fullName || item.contactPerson || item.phone || undefined,
        code: item.code,
        meta: [
          item.subjectType === "individual" ? "个人" : "单位",
          EXTERNAL_PARTY_RELATED_PARTY_LABELS[item.relatedPartyType],
          item.classification ? `业务：${item.classification}` : null,
        ].filter(Boolean) as string[],
        status: { label: item.isActive ? "开启" : "关闭", tone: item.isActive ? "success" : "muted" },
        tone: item.relatedPartyType === "unrelated" ? "slate" : "amber",
        size: "sm",
      },
    })),
    onSelect: (item) => void selectItem(item),
    size: "sm",
  };

  const toolbarItems: SurfaceToolbarItems = [
    {
      kind: "search",
      key: "search",
      value: data.keyword,
      onChange: data.setKeyword,
      placeholder: `搜索${labels.singular}名称、编码、业务分类、联系人或电话`,
      scope: ["名称", "编码", "业务分类", "联系人", "电话"],
    },
    {
      kind: "action-group",
      key: "actions",
      actions: [{ key: "refresh", kind: "refresh", label: "刷新", onClick: () => void data.load() }],
    },
    { kind: "text", key: "total", content: `共 ${data.total} 条` },
  ];

  const createSection = {
    key: "external-party-create",
    chrome: "plain" as const,
    body: {
      kind: "create" as const,
      create: {
        id: `external-${category}-create`,
        trigger: "toolbar" as const,
        presentation: "modal" as const,
        title: `新增${labels.singular}`,
        open: Boolean(createDraft),
        canCreate,
        disabled: saving,
        content: {
          kind: "sections" as const,
          sections: externalPartyFormSections(category, createDraft ?? emptyExternalPartyDraft(), updateCreateDraft),
        },
        submission: {
          action: "save" as const,
          disabled: saving || !createDraft?.code.trim() || !createDraft.name.trim(),
          execute: saveCreate,
        },
        onOpenChange: (open: boolean) => setCreateDraft(open ? emptyExternalPartyDraft() : null),
      },
    },
  };

  const detailSection = detailDraft && selected
    ? createFieldsSection("external-party-detail", externalPartyEditSections(category, detailDraft, updateDetailDraft, { readOnly: !canUpdate }), {
        header: {
          title: selected.name,
          description: `${labels.singular}编码 ${selected.code} · ${EXTERNAL_PARTY_RELATED_PARTY_LABELS[detailDraft.relatedPartyType]}`,
        },
        actions: [
          ...(canUpdate ? [
            { key: "reset", action: "reset" as const, label: "撤销修改", disabled: saving || !dirty, onClick: resetDetail },
            { key: "save", action: "save" as const, label: saving ? "保存中..." : "保存", disabled: saving || !dirty || !detailDraft.code.trim() || !detailDraft.name.trim(), onClick: () => void saveDetail() },
          ] : []),
          ...(canDelete ? [{ key: "delete", action: "delete" as const, label: `删除${labels.singular}`, disabled: saving, onClick: () => void deleteSelected() }] : []),
        ],
        submit: canUpdate ? { onSubmit: () => void saveDetail() } : undefined,
      })
    : createEmptySection("external-party-empty", {
        content: `从左侧选择${labels.singular}查看详情`,
        presentation: "card",
      });

  return (
    <PageSurface
      kind="standard"
      toolbar={{ items: toolbarItems }}
      body={createBodySplitSection({
        left: { kind: "selector", selector },
        drawerLeft: { kind: "selector", selector },
        right: createPageBody([createSection, detailSection]),
        side: {
          label: `${labels.singular}目录`,
          open: sideOpen,
          drawerOpen,
          onOpenChange: setSideOpen,
          onDrawerOpenChange: setDrawerOpen,
          showControls: true,
        },
        layout: { ratio: [1, 3] },
      })}
      footer={{
        pagination: {
          page: data.page,
          totalPages: data.totalPages,
          total: data.total,
          onPageChange: data.setPage,
          compact: true,
        },
      }}
    />
  );
}
