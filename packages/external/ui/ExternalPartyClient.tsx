"use client";

import { useEffect, useState } from "react";
import {
  PageSurface,
  createMasterDetailBody,
  createEmptySection,
  createFieldsSection,
  createPageBody,
  useFeedback,
  type SelectorSurfaceProps,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import { createBusinessTemporalView } from "@workspace/platform/ui";
import { EXTERNAL_LEGAL_FACT_TEMPORAL, EXTERNAL_PARTY_ROLE_TEMPORAL } from "@workspace/external/business-temporal";
import type { ExternalParty, ExternalPartyCategory, ExternalPartyDraft } from "@workspace/external/types";
import {
  emptyExternalPartyDraft,
  EXTERNAL_PARTY_LABELS,
  EXTERNAL_PARTY_RELATED_PARTY_LABELS,
  EXTERNAL_PARTY_ROLE_LABELS,
  externalPartyEditSections,
  externalPartyFormSections,
  type ExternalPartyDraftValue,
} from "./external-party-form";
import { useExternalParties, useExternalPartyCandidates } from "./useExternalParties";
import {
  emptyExternalPartyAvailabilityDraft,
  externalPartyAvailabilitySections,
  type ExternalPartyAvailabilityDraft,
} from "./external-party-availability-form";

interface ExternalPartyClientProps {
  category: ExternalPartyCategory;
  apiPath: string;
  otherApiPath?: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canUpdateOtherRole: boolean;
}

export default function ExternalPartyClient({
  category,
  apiPath,
  otherApiPath,
  canCreate,
  canUpdate,
  canDelete,
  canUpdateOtherRole,
}: ExternalPartyClientProps) {
  const data = useExternalParties(apiPath);
  const labels = EXTERNAL_PARTY_LABELS[category];
  const [selected, setSelected] = useState<ExternalParty | null>(null);
  const [detailDraft, setDetailDraft] = useState<ExternalPartyDraft | null>(null);
  const [createDraft, setCreateDraft] = useState<ExternalPartyDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availabilityDraft, setAvailabilityDraft] = useState<ExternalPartyAvailabilityDraft>(emptyExternalPartyAvailabilityDraft);
  const candidates = useExternalPartyCandidates(otherApiPath, Boolean(createDraft));
  const feedback = useFeedback({ unsavedChanges: dirty });

  useEffect(() => {
    if (!selected && data.items[0]) {
      setSelected(data.items[0]);
      setDetailDraft({ ...data.items[0], effectiveOn: data.items[0].asOfDate, legalFactReason: null });
      return;
    }
    if (!selected || dirty) return;
    const refreshed = data.items.find((item) => item.id === selected.id);
    if (refreshed && (refreshed.version !== selected.version || refreshed.asOfDate !== selected.asOfDate)) {
      setSelected(refreshed);
      setDetailDraft({ ...refreshed, effectiveOn: refreshed.asOfDate, legalFactReason: null });
    }
  }, [data.items, dirty, selected]);

  function updateCreateDraft(field: keyof ExternalPartyDraft, value: ExternalPartyDraftValue) {
    setCreateDraft((current) => current ? { ...current, [field]: value } : current);
  }

  function selectExistingParty(party: ExternalParty | null) {
    setCreateDraft((current) => {
      if (!current) return current;
      if (!party) {
        return {
          ...current,
          existingPartyId: null,
          subjectType: "organization",
          relatedPartyType: "unrelated",
          name: "",
          fullName: null,
          identityNumber: "",
          legalRepresentative: null,
        };
      }
      return {
        ...current,
        existingPartyId: party.id,
        subjectType: party.subjectType,
        relatedPartyType: party.relatedPartyType,
        name: party.name,
        fullName: party.fullName,
        identityNumber: party.identityNumber,
        legalRepresentative: party.legalRepresentative,
      };
    });
  }

  function updateDetailDraft(field: keyof ExternalPartyDraft, value: ExternalPartyDraftValue) {
    if (!canUpdate) return;
    setDetailDraft((current) => current ? { ...current, [field]: value } : current);
    setDirty(true);
  }

  async function selectItem(item: ExternalParty) {
    if (item.id === selected?.id) {
      return;
    }
    if (dirty && !await feedback.confirmLeave()) return;
    setSelected(item);
    setDetailDraft({ ...item, effectiveOn: item.asOfDate, legalFactReason: null });
    setAvailabilityDraft(emptyExternalPartyAvailabilityDraft());
    setDirty(false);
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
        setDetailDraft({ ...result.record, effectiveOn: result.record.asOfDate, legalFactReason: null });
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
        setDetailDraft({ ...result.record, effectiveOn: result.record.asOfDate, legalFactReason: null });
      }
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  function resetDetail() {
    if (!selected) return;
    setDetailDraft({ ...selected, effectiveOn: selected.asOfDate, legalFactReason: null });
    setDirty(false);
  }

  async function deleteSelected() {
    if (!selected) return;
    const confirmed = await feedback.confirmDelete({
      message: `确定从 ${data.businessDate} 起停用“${selected.name}”的${labels.singular}角色吗？角色、来源映射和历史期间都会保留。`,
    });
    if (!confirmed) return;
    const result = await data.remove(selected, data.businessDate, "用户从角色详情停用");
    if (!result.ok) return feedback.error(result.error);
    setDirty(false);
    feedback.success("角色已登记停用");
  }

  function updateAvailabilityDraft<K extends keyof ExternalPartyAvailabilityDraft>(
    key: K,
    value: ExternalPartyAvailabilityDraft[K],
  ) {
    setAvailabilityDraft((current) => ({ ...current, [key]: value }));
  }

  async function submitAvailabilityCommand() {
    if (!selected) return;
    if (availabilityDraft.kind !== "cancel-future" && !availabilityDraft.validFrom) {
      return feedback.error("启用日必填");
    }
    if (availabilityDraft.kind !== "schedule" && !availabilityDraft.periodId) {
      return feedback.error("请选择目标期间");
    }
    if (availabilityDraft.kind !== "schedule" && !availabilityDraft.reason.trim()) {
      return feedback.error("生命周期操作必须填写原因");
    }
    setSaving(true);
    try {
      const command = availabilityDraft.kind === "schedule"
        ? {
            kind: "schedule" as const,
            validFrom: availabilityDraft.validFrom,
            validThrough: availabilityDraft.validThrough,
            reason: availabilityDraft.reason.trim() || null,
          }
        : availabilityDraft.kind === "correct"
          ? {
              kind: "correct" as const,
              periodId: availabilityDraft.periodId!,
              validFrom: availabilityDraft.validFrom,
              validThrough: availabilityDraft.validThrough,
              reason: availabilityDraft.reason.trim(),
            }
          : {
              kind: "cancel-future" as const,
              periodId: availabilityDraft.periodId!,
              reason: availabilityDraft.reason.trim(),
            };
      const result = await data.changeAvailability(selected, command);
      if (!result.ok) return feedback.error(result.error);
      setAvailabilityDraft(emptyExternalPartyAvailabilityDraft());
      feedback.success("角色可用期间已登记");
    } finally {
      setSaving(false);
    }
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
          item.roles.map((role) => EXTERNAL_PARTY_ROLE_LABELS[role]).join(" / "),
          EXTERNAL_PARTY_RELATED_PARTY_LABELS[item.relatedPartyType],
          item.classification ? `业务：${item.classification}` : null,
        ].filter(Boolean) as string[],
        status: { label: item.isActive ? "开启" : "关闭", tone: item.isActive ? "success" : "muted" },
        tone: item.relatedPartyType === "unrelated" ? "slate" : "amber",
      },
    })),
    onSelect: (item) => void selectItem(item),
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
      kind: "period",
      key: "as-of-date",
      mode: "date",
      value: data.asOfDate || null,
      onChange: (value) => data.setAsOfDate(value || ""),
      placeholder: "基准日",
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
    body: {
      kind: "create" as const,
      create: {
        id: `external-${category}-create`,
        trigger: "toolbar" as const,
        presentation: "block" as const,
        title: `新增${labels.singular}`,
        open: Boolean(createDraft),
        canCreate,
        disabled: saving,
        content: {
          kind: "sections" as const,
          sections: externalPartyFormSections(category, createDraft ?? emptyExternalPartyDraft(), updateCreateDraft, {
            existingCandidates: otherApiPath
              ? candidates.items.filter((party) => !party.roles.includes(category))
              : undefined,
            candidatesLoading: candidates.loading,
            candidatesError: candidates.error,
            onExistingPartyChange: selectExistingParty,
          }),
        },
        submission: {
          action: "save" as const,
          disabled: saving || !createDraft?.code.trim() || !createDraft.name.trim() || !createDraft.identityNumber.trim(),
          execute: saveCreate,
        },
        onOpenChange: (open: boolean) => setCreateDraft(open ? emptyExternalPartyDraft() : null),
        onCancel: () => setCreateDraft(null),
      },
    },
  };

  const detailSection = detailDraft && selected
    ? createFieldsSection("external-party-detail", externalPartyEditSections(category, detailDraft, updateDetailDraft, {
        readOnly: !canUpdate,
        subjectReadOnly: selected.roles.length > 1 && !canUpdateOtherRole,
      }), {
        header: {
          title: selected.name,
          description: `${labels.singular}编码 ${selected.code} · ${selected.roles.map((role) => EXTERNAL_PARTY_ROLE_LABELS[role]).join(" / ")} · ${EXTERNAL_PARTY_RELATED_PARTY_LABELS[detailDraft.relatedPartyType]}`,
        },
        actions: [
          ...(canUpdate ? [
            { key: "reset", action: "reset" as const, label: "撤销修改", disabled: saving || !dirty, onClick: resetDetail },
            { key: "save", action: "save" as const, label: saving ? "保存中..." : "保存", disabled: saving || !dirty || !detailDraft.code.trim() || !detailDraft.name.trim() || !detailDraft.identityNumber.trim(), onClick: () => void saveDetail() },
          ] : []),
          ...(canDelete ? [{ key: "delete", action: "delete" as const, label: `停用${labels.singular}角色`, disabled: saving || dirty || !data.businessDate, onClick: () => void deleteSelected() }] : []),
        ],
        submit: canUpdate ? { onSubmit: () => void saveDetail() } : undefined,
      })
    : createEmptySection("external-party-empty", {
        content: `从左侧选择${labels.singular}查看详情`,
        presentation: "card",
      });

  const availabilityCommandSection = selected && canUpdate
    ? createFieldsSection(
        "external-party-availability-command",
        externalPartyAvailabilitySections(selected, availabilityDraft, updateAvailabilityDraft),
        {
          header: { title: "角色生命周期" },
          actions: [{
            key: "submit-availability",
            action: "save" as const,
            label: saving ? "登记中..." : "登记变化",
            disabled: saving || dirty,
            onClick: () => void submitAvailabilityCommand(),
          }],
          submit: { onSubmit: () => void submitAvailabilityCommand() },
        },
      )
    : null;

  const roleAvailabilitySections = selected
    ? createBusinessTemporalView({
        kind: "availability",
        registration: EXTERNAL_PARTY_ROLE_TEMPORAL,
        asOfDate: selected.asOfDate,
        items: selected.availabilityTimeline.map((item) => ({
          key: item.id,
          title: item.commandKind === "baseline" ? "迁移现状基线" : `角色期间 #${item.sequence}`,
          description: item.reason || undefined,
          meta: item.authoritative ? "权威期间" : undefined,
          validFrom: item.validFrom,
          validThrough: item.validThrough,
          temporalState: item.temporalState,
          recordState: item.recordState,
        })),
      }).body.sections
    : [];

  const legalFactSections = selected
    ? createBusinessTemporalView({
        kind: "effective-period",
        registration: EXTERNAL_LEGAL_FACT_TEMPORAL,
        asOfDate: selected.asOfDate,
        items: selected.legalFactTimeline.map((item) => ({
          key: item.id,
          title: item.fullName || item.name,
          description: [item.legalRepresentative ? `法定代表人：${item.legalRepresentative}` : null, item.reason].filter(Boolean).join(" · ") || undefined,
          meta: item.sourceLabel || item.sourceReference || undefined,
          validFrom: item.effectiveOn,
          validThrough: item.validThrough,
          temporalState: item.temporalState,
          recordState: item.recordState,
        })),
      }).body.sections
    : [];

  return (
    <PageSurface
      kind="standard"
      toolbar={{ items: toolbarItems }}
      body={createMasterDetailBody({
        master: { label: `${labels.singular}目录`, presentation: "compact", body: { kind: "selector", selector } },
        detail: createPageBody([
          createSection,
          ...(createDraft ? [] : [
            detailSection,
            ...(availabilityCommandSection ? [availabilityCommandSection] : []),
            ...roleAvailabilitySections,
            ...legalFactSections,
          ]),
        ]),
        desktop: { ratio: [1, 3] },
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
