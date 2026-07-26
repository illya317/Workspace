"use client";

import { useEffect, useMemo, useState } from "react";

import { workspacePath } from "@workspace/core/routing";
import {
  createAnalysisSection,
  createMasterDetailBody,
  createMessageSection,
  createPageBody,
  createPageDataSection,
  createPageTableSection,
  createPageTabBar,
  createStatusSection,
  createVisualizationSection,
  PageSurface,
  type SelectorSurfaceProps,
  type VisualizationNetworkSpec,
} from "@workspace/core/ui";
import { requestJson } from "@workspace/platform/ui/api-client";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";
import type { InvestorRelationshipView, OwnershipStructureGraph, ShareholderPosition } from "../types";
import {
  CAPITAL_TRANSACTION_COLUMNS,
  CAPITAL_TRANSACTION_VISIBLE_COLUMNS,
  createCaptableStructuredRows,
  createFinancingStructuredRows,
  flattenShareCapitalTransactions,
  formatRelationshipRatio,
  formatWanYuan,
  SHAREHOLDER_COLUMNS,
  SHAREHOLDER_VISIBLE_COLUMNS,
} from "./investor-relationships-ui";

const ENDPOINT = "/api/modules/capitalSecurities/investors";

type InvestorView = "shareholders" | "captable" | "structure";

const VIEWS = [
  { key: "shareholders", label: "股权情况" },
  { key: "captable", label: "股权结构表" },
  { key: "structure", label: "股权结构图" },
] as const;

export default function InvestorsClient() {
  const businessTimeZone = useTenantConfig().localization.businessTimeZone;
  const [view, setView] = useState<InvestorView>("shareholders");
  const [asOf, setAsOf] = useState(() => currentBusinessDate(businessTimeZone));
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedPartyId, setSelectedPartyId] = useState<number | null>(null);
  const [data, setData] = useState<InvestorRelationshipView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobileDetailActive, setMobileDetailActive] = useState(false);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ asOf });
    if (selectedCompanyId) params.set("issuerCompanyId", String(selectedCompanyId));
    setLoading(true);
    setError("");
    void requestJson<InvestorRelationshipView>(`${ENDPOINT}?${params.toString()}`)
      .then((nextData) => {
        if (!active) return;
        setData(nextData);
        if (selectedCompanyId === null && nextData.selectedCompany) {
          setSelectedCompanyId(nextData.selectedCompany.id);
        }
        setSelectedPartyId((current) => nextData.shareholders.some((item) => item.partyId === current)
          ? current
          : nextData.shareholders[0]?.partyId ?? null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "投资人关系加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [asOf, selectedCompanyId]);

  const navigation = useMemo(() => createPageTabBar({
    items: [...VIEWS],
    active: view,
    onChange: (key) => setView(key as InvestorView),
    ariaLabel: "股权与股权结构表视图",
  }), [view]);

  const selectedShareholder = data?.shareholders.find((item) => item.partyId === selectedPartyId) ?? null;
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
  }), [data?.shareholders, error, loading, selectedPartyId]);

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
            },
            searchable: true,
          } as const]),
          {
            kind: "period",
            key: "as-of",
            mode: "date",
            value: asOf,
            onChange: (value) => setAsOf(value || currentBusinessDate(businessTimeZone)),
            placeholder: "股权基准日",
          },
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
              label: "下载 CSV",
              kind: "export" as const,
              disabled: !data?.ownershipStructure || loading,
              onClick: downloadOwnershipStructure,
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
    if (view === "captable") return createPageBody(captableSections());
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
    return [
      createAnalysisSection("shareholder-information", {
        title: "股东信息",
        sections: [createPageTableSection("shareholder-information-table", {
          rows: [selectedShareholder],
          columns: SHAREHOLDER_COLUMNS,
          visibleColumns: SHAREHOLDER_VISIBLE_COLUMNS,
          rowKey: (row) => row.partyId,
          loading,
          emptyText: "暂无股东信息",
          presentation: { density: "compact", cellWrap: "nowrap" },
        })],
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

  function captableSections() {
    return [
      createMessageSection("captable-rule", {
        tone: data?.metrics.pendingEventCount ? "warning" : "muted",
        content: data?.metrics.pendingEventCount
          ? `口径：认缴注册资本｜单位：万元｜基准日：${asOf}｜黄色轮次为待变更，暂不计入当前已登记股权。持股比例和估值均由注册资本与实际出资自动计算。`
          : `口径：认缴注册资本｜单位：万元｜基准日：${asOf}。持股比例和估值均由注册资本与实际出资自动计算。`,
      }),
      createAnalysisSection("captable", {
        title: `${data?.selectedCompany?.name ?? ""}股权结构表`,
        sections: [createPageDataSection("captable-table", {
          kind: "structured",
          rows: captableRows,
          structuredScroll: true,
          format: {
            kind: "matrix",
            columnWidths: [
              "11rem",
              ...(data?.captableRounds ?? []).flatMap(() => ["8rem", "6rem"]),
            ],
            headerRowHeight: "4rem",
            bodyRowHeight: "3rem",
          },
          frame: "clipped",
          scroll: { x: true, y: "hidden" },
          mobile: {
            presentation: "landscape",
            title: "股权结构表",
            reason: "股权结构表是跨轮次比较矩阵，请横屏查看完整轮次。",
          },
          presentation: {
            density: "compact",
            header: "strong",
            grid: "cells",
            cellWrap: "nowrap",
            controlHeight: "auto",
          },
        })],
      }),
      createAnalysisSection("financing-rounds", {
        title: "各轮估值与出资",
        sections: [createPageDataSection("financing-rounds-table", {
          kind: "structured",
          rows: financingRows,
          structuredScroll: true,
          format: {
            kind: "matrix",
            columnWidths: [
              "13rem",
              ...(data?.financingRounds ?? []).map(() => "11rem"),
            ],
            headerRowHeight: "4rem",
            bodyRowHeight: "3rem",
          },
          frame: "clipped",
          scroll: { x: true, y: "hidden" },
          mobile: {
            presentation: "landscape",
            title: "各轮估值与出资",
            reason: "估值与出资按轮次横向比较，请横屏查看。",
          },
          presentation: {
            density: "compact",
            header: "strong",
            grid: "cells",
            cellWrap: "nowrap",
            controlHeight: "auto",
          },
        })],
      }),
    ];
  }

  function downloadCaptable() {
    if (!data?.selectedCompany) return;
    const params = new URLSearchParams({
      issuerCompanyId: String(data.selectedCompany.id),
      asOf,
    });
    window.location.assign(workspacePath(`${ENDPOINT}/export?${params.toString()}`));
  }

  function downloadOwnershipStructure() {
    if (!data?.ownershipStructure) return;
    downloadOwnershipStructureCsv(data.ownershipStructure);
  }
}

function currentBusinessDate(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function ownershipStructureName(graph: InvestorRelationshipView["ownershipStructure"]) {
  if (!graph) return "股权";
  return graph.nodes.find((node) => node.key === graph.rootNodeKey)?.label ?? "股权";
}

function downloadOwnershipStructureCsv(graph: OwnershipStructureGraph) {
  const nodeNames = new Map(graph.nodes.map((node) => [node.key, node.label]));
  const rows = [
    ["关系类型", "持股方", "被持股方", "持股比例", "变更前持股比例", "状态", "并表口径", "基准日"],
    ...graph.edges.map((edge) => [
      edge.relationType === "share_capital" ? "主角公司股本" : "集团股权关系",
      nodeNames.get(edge.source) ?? edge.source,
      nodeNames.get(edge.target) ?? edge.target,
      csvRatio(edge.shareRatio),
      csvRatio(edge.previousShareRatio),
      edge.recordStatus === "confirmed" ? "已确认" : "待变更",
      edge.isConsolidated ? "纳入并表" : "不纳入并表",
      graph.asOf,
    ]),
  ];
  const content = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${ownershipStructureName(graph)}-股权关系-${graph.asOf}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvRatio(value: number | null) {
  return value === null ? "" : `${(value * 100).toFixed(4).replace(/\.?0+$/, "")}%`;
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
