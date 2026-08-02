"use client";
import { useMemo } from "react";
import { workspacePath } from "@workspace/core/routing";
import {
  createAnalysisSection,
  createEmptySection,
  createFieldsSection,
  createMasterDetailBody,
  createPageBody,
  createPanelSection,
  createPageTableSection,
  createPageTabBar,
  createStatusSection,
  createVisualizationSection,
  PageSurface,
  type PageSurfaceCreateSpec,
  type SelectorSurfaceProps,
  type VisualizationNetworkSpec,
} from "@workspace/core/ui";
import type {
  InvestorDueDiligenceRecord,
  ShareholderPosition,
} from "../types";
import {
  CAPITAL_TRANSACTION_COLUMNS,
  CAPITAL_TRANSACTION_VISIBLE_COLUMNS,
  createCaptableStructuredRows,
  createFinancingStructuredRows,
  flattenShareCapitalTransactions,
  formatRelationshipRatio,
  formatWanYuan,
} from "./investor-relationships-ui";
import {
  DILIGENCE_STATUS_LABELS,
  dueDiligenceFormSections,
  emptyInvestorDueDiligenceDraft,
  shareholderProfileFormSections,
} from "./investor-relationship-forms";
import {
  currentBusinessDate,
  useInvestorRelationshipState,
} from "./use-investor-relationship-state";
import { createInvestorCaptableSections } from "./investor-captable-sections";
import { downloadOwnershipStructurePdf } from "./ownership-structure-pdf";
const ENDPOINT = "/api/modules/capitalSecurities/investors";
type InvestorView = "shareholders" | "captable" | "structure" | "diligence";
const VIEWS = [
  { key: "shareholders", label: "股权情况" },
  { key: "captable", label: "股权结构表" },
  { key: "structure", label: "股权结构图" },
  { key: "diligence", label: "尽调情况" },
] as const;
export default function InvestorsClient({
  canCreate = false,
  canUpdate = false,
  canDelete = false,
}: {
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}) {
  const {
    businessTimeZone, view, setView, asOf, setAsOf,
    selectedCompanyId, setSelectedCompanyId, selectedPartyId, setSelectedPartyId,
    selectedDiligenceId, setSelectedDiligenceId, data, profileDraft, diligenceDraft,
    setDiligenceDraft, creatingDiligence, setCreatingDiligence, loading, error,
    mobileDetailActive, setMobileDetailActive, exportingStructure, setExportingStructure,
    savingProfile, savingDiligence, feedback, selectedShareholder, selectedDiligence,
    updateProfileDraft, resetProfileDraft, saveProfile, updateDiligenceDraft,
    openDiligenceCreate, cancelDiligenceCreate, createDiligence,
    resetDiligenceDraft, saveDiligence, archiveDiligence,
  } = useInvestorRelationshipState({ canCreate, canUpdate, canDelete });
  const navigation = useMemo(() => createPageTabBar({
    items: [...VIEWS],
    active: view,
    onChange: (key) => setView(key as InvestorView),
    ariaLabel: "投资人关系工作视图",
  }), [setView, view]);
  const selector = useMemo<SelectorSurfaceProps<ShareholderPosition>>(() => ({
    kind: "list",
    title: `股东 · ${data?.shareholders.length ?? 0}`,
    items: (data?.shareholders ?? []).map((shareholder) => ({
      key: shareholder.partyId,
      value: shareholder,
      card: {
        title: shareholder.name,
        code: shareholder.shareRatio === null ? "比例待核实" : `${(shareholder.shareRatio * 100).toFixed(2)}%`,
        meta: `${formatWanYuan(shareholder.confirmedSubscribedCapitalYuan)} 万元`,
        status: shareholder.pendingCapitalDeltaYuan === null
          ? { label: "金额待补", tone: "warning" }
          : shareholder.pendingCapitalDeltaYuan === 0
          ? { label: "已登记", tone: "success" }
          : { label: "待变更", tone: "warning" },
      },
    })),
    selectedId: selectedPartyId,
    loading,
    loadingText: "正在生成股东名册",
    emptyText: error || "暂无股东",
    onSelect: (shareholder) => {
      setSelectedPartyId(shareholder.partyId);
      setMobileDetailActive(true);
    },
  }), [data?.shareholders, error, loading, selectedPartyId, setMobileDetailActive, setSelectedPartyId]);

  const diligenceSelector = useMemo<SelectorSurfaceProps<InvestorDueDiligenceRecord>>(() => ({
    kind: "list",
    title: `尽调人员 · ${data?.dueDiligenceRecords.length ?? 0}`,
    items: (data?.dueDiligenceRecords ?? []).map((record) => ({
      key: record.id,
      value: record,
      card: {
        title: record.visitorName,
        subtitle: [record.investorOrganization, record.visitorTitle].filter(Boolean).join(" · "),
        code: record.diligenceDate,
        meta: record.hostName ? `对接：${record.hostName}` : "内部对接人待补",
        status: {
          label: DILIGENCE_STATUS_LABELS[record.status],
          tone: record.status === "completed" ? "success" : record.status === "cancelled" ? "muted" : "warning",
        },
      },
    })),
    selectedId: selectedDiligenceId,
    loading,
    loadingText: "正在加载尽调记录",
    emptyText: "暂无尽调人员记录",
    onSelect: (record) => {
      setCreatingDiligence(false);
      setSelectedDiligenceId(record.id);
      setDiligenceDraft({ ...record });
      setMobileDetailActive(true);
    },
  }), [data?.dueDiligenceRecords, loading, selectedDiligenceId, setCreatingDiligence, setDiligenceDraft, setMobileDetailActive, setSelectedDiligenceId]);

  const transactionRows = useMemo(
    () => flattenShareCapitalTransactions(data?.events ?? [], selectedPartyId),
    [data?.events, selectedPartyId],
  );
  const captableRows = useMemo(
    () => createCaptableStructuredRows(
      data?.selectedCompany?.name ?? "股东",
      data?.captableRounds ?? [],
      data?.captableRows ?? [],
    ),
    [data?.captableRounds, data?.captableRows, data?.selectedCompany?.name],
  );
  const financingRows = useMemo(
    () => createFinancingStructuredRows(data?.financingRounds ?? []),
    [data?.financingRounds],
  );
  const ownershipStructureVisual = useMemo<VisualizationNetworkSpec>(() => {
    const graph = data?.ownershipStructure;
    if (!graph) return { kind: "network", nodes: [], edges: [], emptyText: "暂无股权关系数据" };
    const groupByMemberNodeKey = new Map(graph.groups.flatMap((group) => (
      group.memberNodeKeys.map((nodeKey) => [nodeKey, group] as const)
    )));
    return {
      kind: "network",
      focusNodeKey: graph.rootNodeKey,
      height: 560,
      emptyText: "暂无股权关系数据",
      groups: graph.groups.map((group) => ({
        key: group.key,
        label: group.label,
        outlined: true,
        layoutOrder: group.layoutOrder,
        tone: group.recordStatus === "pending" ? "amber" : "slate",
      })),
      nodes: graph.nodes.map((node) => {
        const group = groupByMemberNodeKey.get(node.key);
        return {
          key: node.key,
          label: node.label,
          subtitle: node.subtitle ?? undefined,
          groupKey: group?.key,
          layoutOrder: node.layoutOrder,
          size: node.role === "focus" ? "wide" as const : node.role === "shareholder" || node.role === "co_owner" ? "compact" as const : "default" as const,
          emphasis: node.role === "focus" ? "focus" as const : node.role === "co_owner" ? "context" as const : "primary" as const,
          tone: node.role === "focus"
            ? "blue" as const
            : node.role === "subsidiary"
              ? "emerald" as const
              : node.role === "co_owner"
                ? "amber" as const
                : "slate" as const,
        };
      }),
      edges: [
        ...graph.edges.map((edge) => ({
          key: edge.key,
          source: edge.source,
          target: edge.target,
          label: formatRelationshipRatio(edge.previousShareRatio, edge.shareRatio, edge.recordStatus),
          value: edge.shareRatio ?? undefined,
          tone: edge.recordStatus === "pending"
            ? "amber" as const
            : edge.relationType === "share_capital"
              ? "blue" as const
              : edge.isConsolidated
                ? "emerald" as const
                : "slate" as const,
          dashed: edge.recordStatus === "pending",
        })),
        ...graph.groups.map((group) => ({
          key: `group-capital:${group.key}`,
          source: group.key,
          target: graph.rootNodeKey,
          label: formatRelationshipRatio(group.previousShareRatio, group.shareRatio, group.recordStatus),
          tone: group.recordStatus === "pending" ? "amber" as const : "blue" as const,
          dashed: group.recordStatus === "pending",
        })),
      ],
    };
  }, [data?.ownershipStructure]);
  const ownershipStructureRootName = data?.ownershipStructure?.nodes.find(
    (node) => node.key === data.ownershipStructure?.rootNodeKey,
  )?.label ?? "集团主体";

  return (
    <PageSurface
      kind="standard"
      create={diligenceCreateSurface()}
      tabbar={navigation}
      toolbar={{
        items: [
          ...(view === "structure" ? [] : [{
            kind: "select",
            key: "company",
            label: "公司",
            value: selectedCompanyId ? String(selectedCompanyId) : "",
            options: (data?.companies ?? []).map((company) => ({
              value: String(company.id),
              label: company.name,
            })),
            onChange: (value: string) => {
              setSelectedCompanyId(value ? Number(value) : null);
              setSelectedPartyId(null);
              setSelectedDiligenceId(null);
              setCreatingDiligence(false);
            },
            searchable: true,
          } as const]),
          ...(view === "diligence" ? [] : [{
            kind: "period",
            key: "as-of",
            mode: "date",
            value: asOf,
            onChange: (value: string | null) => setAsOf(value || currentBusinessDate(businessTimeZone)),
            placeholder: "股权基准日",
          } as const]),
          ...(view === "captable" ? [{
            kind: "action-group" as const,
            key: "captable-actions",
            actions: [{
              key: "export",
              label: "导出股权结构表",
              kind: "export" as const,
              disabled: !data?.selectedCompany || loading,
              onClick: downloadCaptable,
            }],
          }] : []),
          ...(view === "structure" ? [{
            kind: "action-group" as const,
            key: "structure-actions",
            actions: [{
              key: "export",
              label: "下载 PDF",
              kind: "export" as const,
              disabled: !data?.ownershipStructure || loading || exportingStructure,
              onClick: () => { void downloadOwnershipStructure(); },
            }],
          }] : []),
        ],
      }}
      body={pageBody()}
    />
  );

  function pageBody() {
    if (error) return createPageBody([createStatusSection("investors-error", { kind: "error", content: error })]);
    if (!data?.selectedCompany) {
      return createPageBody([createStatusSection("investors-empty", {
        kind: loading ? "loading" : "empty",
        content: loading ? "正在生成股权台账" : "暂无可查询的公司",
      })]);
    }
    if (view === "captable") return createPageBody(createInvestorCaptableSections({ data, asOf, captableRows, financingRows }));
    if (view === "diligence") {
      return createMasterDetailBody({
        master: { label: "尽调人员", presentation: "compact", body: { kind: "selector", selector: diligenceSelector } },
        detail: createPageBody(dueDiligenceSections()),
        mobile: { detailActive: mobileDetailActive, onNavigateToList: () => setMobileDetailActive(false) },
      });
    }
    if (view === "structure") {
      return createPageBody([
        createVisualizationSection("shareholding-structure", {
          kind: "chart",
          chart: {
            frame: {
              title: `${ownershipStructureRootName}股权结构图`,
              subtitle: "全资子公司沿中轴展开，非全资子公司自动分配到左右分支；拖动画布或缩放查看细节。",
            },
            visual: ownershipStructureVisual,
          },
        }),
      ]);
    }
    return createMasterDetailBody({
      master: { label: "股东", presentation: "compact", body: { kind: "selector", selector } },
      detail: createPageBody(shareholderSections()),
      mobile: { detailActive: mobileDetailActive, onNavigateToList: () => setMobileDetailActive(false) },
    });
  }

  function shareholderSections() {
    if (!selectedShareholder) {
      return [createStatusSection("shareholder-empty", {
        kind: loading ? "loading" : "empty",
        content: loading ? "正在生成股东信息" : "暂无股东信息",
      })];
    }
    if (!profileDraft) {
      return [createStatusSection("shareholder-profile-loading", {
        kind: "loading",
        content: "正在准备股东资料",
      })];
    }
    const profileSections = shareholderProfileFormSections(
      selectedShareholder,
      profileDraft,
      updateProfileDraft,
      canUpdate,
    );
    return [
      createPanelSection("shareholder-information", {
        title: `${selectedShareholder.name} · 股东资料`,
        sections: profileSections.map((section, index) => createFieldsSection(
          `shareholder-profile-${section.key}`,
          section.items,
          {
            header: section.title ? { title: section.title } : undefined,
            layout: section.layout,
            actions: canUpdate && index === profileSections.length - 1 ? [
              {
                key: "reset-profile",
                action: "reset",
                label: "撤销修改",
                disabled: savingProfile,
                onClick: resetProfileDraft,
              },
              {
                key: "save-profile",
                action: "save",
                label: savingProfile ? "保存中..." : "保存股东资料",
                disabled: savingProfile,
                onClick: () => { void saveProfile(); },
              },
            ] : undefined,
          },
        )),
      }),
      createAnalysisSection("share-capital-transactions", {
        title: "转让、增资、减资与回购记录",
        sections: [createPageTableSection("share-capital-transactions-table", {
          rows: transactionRows,
          columns: CAPITAL_TRANSACTION_COLUMNS,
          visibleColumns: CAPITAL_TRANSACTION_VISIBLE_COLUMNS,
          rowKey: (row) => row.key,
          loading,
          emptyText: "该股东暂无股本变动记录",
          presentation: { density: "compact", cellWrap: "nowrap" },
        })],
      }),
    ];
  }

  function dueDiligenceSections() {
    if (creatingDiligence) return [];
    if (!diligenceDraft || !selectedDiligence) {
      return [createEmptySection("diligence-empty", {
        presentation: "plain",
        content: loading ? "正在加载尽调记录" : "从左侧选择人员查看详情，或新增一条尽调记录",
      })];
    }
    const sections = dueDiligenceFormSections(
      diligenceDraft,
      data?.shareholders ?? [],
      updateDiligenceDraft,
      canUpdate,
    );
    return [createPanelSection("diligence-detail", {
      title: `${diligenceDraft.visitorName || "尽调人员"} · ${diligenceDraft.investorOrganization || "投资机构"}`,
      sections: sections.map((section, index) => createFieldsSection(
        `diligence-detail-${section.key}`,
        section.items,
        {
          header: section.title ? { title: section.title } : undefined,
          layout: section.layout,
          actions: index === sections.length - 1 ? [
            ...(canDelete ? [{
              key: "archive-diligence",
              action: "delete" as const,
              label: "移除记录",
              disabled: savingDiligence,
              onClick: () => { void archiveDiligence(); },
            }] : []),
            ...(canUpdate ? [
              {
                key: "reset-diligence",
                action: "reset" as const,
                label: "撤销修改",
                disabled: savingDiligence,
                onClick: resetDiligenceDraft,
              },
              {
                key: "save-diligence",
                action: "save" as const,
                label: savingDiligence ? "保存中..." : "保存尽调记录",
                disabled: savingDiligence || !diligenceDraft.visitorName || !diligenceDraft.investorOrganization || !diligenceDraft.diligenceDate,
                onClick: () => { void saveDiligence(); },
              },
            ] : []),
          ] : undefined,
        },
      )),
    })];
  }

  function diligenceCreateSurface(): PageSurfaceCreateSpec {
    const draft = diligenceDraft
      ?? emptyInvestorDueDiligenceDraft(data?.selectedCompany?.id ?? 0, currentBusinessDate(businessTimeZone));
    return {
      id: "investor-due-diligence-create",
      presentation: "block",
      title: "新增尽调人员记录",
      open: creatingDiligence,
      canCreate: canCreate && view === "diligence" && Boolean(data?.selectedCompany),
      disabled: savingDiligence,
      content: {
        kind: "sections",
        sections: dueDiligenceFormSections(draft, data?.shareholders ?? [], updateDiligenceDraft, true),
      },
      submission: {
        action: "save",
        disabled: savingDiligence || !draft.visitorName || !draft.investorOrganization || !draft.diligenceDate,
        execute: createDiligence,
      },
      feedback: { saved: "尽调记录已新增", error: "新增尽调记录失败" },
      onOpenChange: (open) => open ? openDiligenceCreate() : cancelDiligenceCreate(),
      onCancel: cancelDiligenceCreate,
    };
  }

  function downloadCaptable() {
    if (!data?.selectedCompany) return;
    const params = new URLSearchParams({
      issuerCompanyId: String(data.selectedCompany.id),
      asOf,
    });
    window.location.assign(workspacePath(`${ENDPOINT}/export?${params.toString()}`));
  }

  async function downloadOwnershipStructure() {
    if (!data?.ownershipStructure) return;
    setExportingStructure(true);
    try {
      await downloadOwnershipStructurePdf(data.ownershipStructure);
      feedback.success("股权结构图 PDF 已下载");
    } catch (cause: unknown) {
      feedback.error(cause instanceof Error ? cause.message : "股权结构图 PDF 下载失败");
    } finally {
      setExportingStructure(false);
    }
  }
}
