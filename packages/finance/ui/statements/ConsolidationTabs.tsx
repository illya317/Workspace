"use client";

import {
  PageSurface,
  createAnalysisSection,
  createFormSection,
  createListSection,
  createMessageSection,
  createMetricsSection,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  useFeedback,
  type BodySurfaceSectionSpec,
  type FormSurfaceFieldSpec,
  type PageSurfaceTabBarSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import type {
  ConsolidationEliminationPackage,
  ConsolidationOverview,
  StatementExchangeRateInput,
} from "@workspace/finance/types";
import { useEffect, useMemo, useState } from "react";
import type { ConsolidationWorkpaperView } from "./StatementsClient";
import {
  consolidationCheckColumns,
  consolidationEntityColumns,
  exchangeRateColumns,
  investmentEvidenceColumns,
} from "./consolidation-columns";

interface ConsolidationTabProps {
  data: ConsolidationOverview | null;
  error: string | null;
  loading: boolean;
  year: number | null;
  month: number | null;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  onRefresh: () => void;
  navigation: PageSurfaceTabBarSpec;
}

interface ConsolidationWorkpaperTabProps extends ConsolidationTabProps {
  activeView: ConsolidationWorkpaperView;
}

const RATE_KIND_OPTIONS = [
  { value: "closing", label: "期末折算价" },
  { value: "historicalInvestment", label: "投资日历史汇率" },
  { value: "average", label: "期间平均汇率" },
];

function defaultRateDraft(periodEndDate = ""): StatementExchangeRateInput {
  return {
    baseCurrency: "CAD",
    quoteCurrency: "CNY",
    rateKind: "closing",
    rateDate: periodEndDate,
    rate: 0,
    sourceUrl: "https://www.boc.cn/sourcedb/whpj/",
    publishedAt: null,
    status: "draft",
    note: null,
  };
}

function usePeriodToolbar(props: ConsolidationTabProps): SurfaceToolbarItems {
  const { data, loading, month, onMonthChange, onYearChange, year } = props;
  return useMemo(() => {
    const periods = data?.scope.availablePeriods ?? [];
    const years = [...new Set(periods.map((period) => period.year))];
    const months = periods.filter((period) => period.year === year).map((period) => period.month);
    return [
      {
        kind: "select" as const,
        key: "year",
        label: "年度",
        options: years.map((value) => ({ value: String(value), label: String(value) })),
        value: year === null ? "" : String(year),
        onChange: (value: string) => onYearChange(Number(value)),
        placeholder: "选择年度",
      },
      {
        kind: "select" as const,
        key: "month",
        label: "月份",
        options: months.map((value) => ({ value: String(value), label: `${value}月` })),
        value: month === null ? "" : String(month),
        onChange: (value: string) => onMonthChange(Number(value)),
        placeholder: "选择月份",
      },
      {
        kind: "text" as const,
        key: "period",
        content: data?.scope.periodLabel ?? "等待读取可用期间",
      },
      ...(loading ? [{ kind: "text" as const, key: "loading", content: "正在核对合并来源与控制点…" }] : []),
    ];
  }, [data, loading, month, onMonthChange, onYearChange, year]);
}

function fallbackSections(error: string | null, loading: boolean): BodySurfaceSectionSpec[] {
  if (loading) return [createStatusSection("consolidation-loading", { kind: "loading", content: "正在读取合并范围和报表来源" })];
  return [createStatusSection("consolidation-error", { kind: "error", content: error || "合并底稿概览加载失败" })];
}

function overviewSections(data: ConsolidationOverview): BodySurfaceSectionSpec[] {
  const parentName = data.scope.parent?.fullName || data.scope.parent?.name || "未识别母公司";
  return [
    createMessageSection("consolidation-definition", {
      content: `合并主体：${parentName} · ${data.scope.periodLabel}。这里按范围、单体来源、外币折算、抵销、税务和复核发布组织编制流程；未闭环的步骤保留事实和下一步，不生成虚假的合并数。`,
    }),
    createMetricsSection("consolidation-readiness-metrics", {
      metrics: [
        { key: "entities", label: "合并实体", value: String(data.metrics.entityCount) },
        { key: "coverage", label: "三表来源覆盖", value: `${data.metrics.coveredSources} / ${data.metrics.totalSources}` },
        { key: "submitted", label: "已提交底稿", value: String(data.metrics.submittedWorkpapers) },
        { key: "blockers", label: "未闭环控制", value: String(data.metrics.blockerCount) },
      ],
    }),
    createAnalysisSection("consolidation-control-overview", {
      title: "合并编制流程",
      sections: [createPageTableSection("consolidation-control-table", {
        rows: data.checks,
        columns: consolidationCheckColumns,
        visibleColumns: consolidationCheckColumns.map((column) => column.key),
        rowKey: (row) => row.key,
        presentation: { density: "compact" },
        rowState: (row) => row.status === "blocked" ? "danger" : row.status === "attention" ? "warning" : "normal",
      })],
    }),
  ];
}

function ownershipSections(data: ConsolidationOverview): BodySurfaceSectionSpec[] {
  const missing = data.entities.filter((entity) => entity.role === "子公司" && entity.shareRatio === null).length;
  return [
    createMessageSection("ownership-source", {
      tone: missing > 0 ? "warning" : "muted",
      content: missing > 0
        ? `以下关系直接读取现有 CompanyRelation 公司关系表，不另建股权台账。当前 ${missing} 条并表关系未填持股比例；尤其境外主体的当前直接持股链路应先与法律资料确认，再维护比例和少数股东口径。`
        : "以下关系直接读取现有 CompanyRelation 公司关系表，持股比例将用于少数股东权益、损益和综合收益拆分。",
    }),
    createPageTableSection("ownership-relations", {
      rows: data.entities,
      columns: consolidationEntityColumns.slice(0, 2),
      visibleColumns: consolidationEntityColumns.slice(0, 2).map((column) => column.key),
      rowKey: (row) => row.relationId === null ? `parent-${row.code}` : `relation-${row.relationId}`,
      presentation: { density: "compact", cellWrap: "wrap" },
      emptyText: "尚未维护并表公司关系",
    }),
    createListSection("ownership-review-list", {
      density: "compact",
      items: [
        { key: "direct-chain", title: "直接持股链路", description: "CompanyRelation 应表达法律直接持股；间接控制比例由服务层沿链路计算，不能把有效比例回填成直接持股。", tone: "info" },
        { key: "control-date", title: "控制取得与丧失日期", description: "新增、处置或控制变化时按控制期间纳入，不按年末静态比例倒推全年。", tone: "warning" },
        { key: "nci-policy", title: "少数股东口径", description: "分别滚动期初权益、本期损益、其他综合收益、分红和资本变动。", tone: "warning" },
      ],
    }),
  ];
}

function sourceSections(data: ConsolidationOverview): BodySurfaceSectionSpec[] {
  return [
    createMessageSection("source-lineage-help", {
      tone: "muted",
      content: "优先使用已提交的报表底稿，并统计来源、导入、手工和公式行；只有系统账时标为回退，既无底稿也无系统事实时直接进入补表清单。",
    }),
    createPageTableSection("consolidation-entity-source-table", {
      rows: data.entities,
      columns: consolidationEntityColumns,
      visibleColumns: consolidationEntityColumns.map((column) => column.key),
      rowKey: (row) => row.code,
      presentation: { density: "compact", cellWrap: "wrap" },
      scroll: { x: true },
      emptyText: "尚未维护合并范围",
    }),
    createListSection("source-review-list", {
      density: "compact",
      items: [
        { key: "period-policy", title: "期间与会计政策一致", description: "统一结账日、会计政策、科目映射和报表项目口径；差异用可追溯调整底稿处理。", tone: "warning" },
        { key: "equity-change", title: "所有者权益变动资料", description: "三表之外还要收集实收资本、资本公积、其他综合收益、未分配利润和分红变动。", tone: "warning" },
        { key: "notes", title: "附注与抵销补充资料", description: "关联方、承诺、或有事项、分部和税务信息不能由三表金额自动推断。", tone: "warning" },
      ],
    }),
  ];
}

function eliminationCards(packages: ConsolidationEliminationPackage[]) {
  return createListSection("consolidation-elimination-list", {
    presentation: "cards",
    items: packages.map((item) => ({
      key: item.key,
      title: item.label,
      description: `${item.description}｜证据：${item.requiredEvidence}｜复核：${item.reviewCheck}`,
      tone: item.status === "sourceReady" ? "info" : "warning",
      badges: [{ key: "status", label: item.status === "sourceReady" ? "来源已齐" : "待编制", tone: item.status === "sourceReady" ? "info" : "warning" }],
    })),
  });
}

function eliminationSections(data: ConsolidationOverview): BodySurfaceSectionSpec[] {
  return [
    createMessageSection("elimination-boundary", {
      tone: "warning",
      content: "抵销分录必须是独立合并底稿，保留借贷行、公司两侧、报表项目、证据、编制人和版本；不能回写单体账，也不能用资产负债差额自动配平。",
    }),
    createAnalysisSection("investment-equity-workpapers", {
      title: "投资、权益与少数股东",
      sections: [eliminationCards(data.eliminations.filter((item) => item.workpaper === "investmentEquity"))],
    }),
    createAnalysisSection("balance-transaction-workpapers", {
      title: "往来、交易与未实现损益",
      sections: [eliminationCards(data.eliminations.filter((item) => item.workpaper === "balancesTransactions"))],
    }),
    createAnalysisSection("cash-flow-workpapers", {
      title: "内部现金流",
      sections: [eliminationCards(data.eliminations.filter((item) => item.workpaper === "cashFlow"))],
    }),
  ];
}

function taxSections(data: ConsolidationOverview): BodySurfaceSectionSpec[] {
  const taxPackages = data.eliminations.filter((item) => item.workpaper === "tax");
  return [
    createMessageSection("tax-workpaper-rule", {
      content: "税务影响跟随每一笔抵销分录计算，不单独用报表差额倒挤。底稿需记录暂时性差异类别、适用税率、预计转回期间、可抵扣性结论和对应递延所得税科目。",
    }),
    eliminationCards(taxPackages),
    createListSection("tax-review-list", {
      density: "compact",
      items: [
        { key: "unrealized-profit", title: "内部未实现损益", description: "存货及长期资产未实现利润通常形成可抵扣暂时性差异，按购买方适用税率复核。", tone: "warning" },
        { key: "impairment", title: "内部往来减值", description: "抵销内部债权债务时同步处理内部信用减值及其递延所得税影响。", tone: "warning" },
        { key: "foreign-tax", title: "境外主体税率与可转回性", description: "加拿大税率、亏损结转和利润汇回影响需由税务证据支持，不能沿用境内默认税率。", tone: "warning" },
        { key: "tie-out", title: "税项勾稽", description: "递延所得税资产负债变动、所得税费用和权益中确认的税项需三向勾稽。", tone: "warning" },
      ],
    }),
  ];
}

function reviewSections(data: ConsolidationOverview): BodySurfaceSectionSpec[] {
  return [
    createMessageSection("review-boundary", {
      tone: "warning",
      content: "编制完成后按合并批次复核、锁定并发布。锁定版本后，股权、汇率、单体底稿或抵销发生变化必须新建版本，不能静默覆盖已发布报表。",
    }),
    createPageTableSection("review-control-table", {
      rows: data.checks,
      columns: consolidationCheckColumns,
      visibleColumns: consolidationCheckColumns.map((column) => column.key),
      rowKey: (row) => row.key,
      presentation: { density: "compact" },
    }),
    createListSection("review-output-list", {
      presentation: "cards",
      items: [
        ...data.outputs.map((output) => ({ key: output.key, title: output.label, description: output.description, tone: "warning" as const, badges: [{ key: "status", label: "待生成", tone: "warning" as const }] })),
        { key: "equity-change", title: "合并所有者权益变动表", description: "年度报告需与少数股东、其他综合收益和利润分配底稿一致。", tone: "warning" as const, badges: [{ key: "status", label: "待生成", tone: "warning" as const }] },
        { key: "notes", title: "合并财务报表附注", description: "披露范围变化、关联交易、外币折算、少数股东和税项等口径。", tone: "warning" as const, badges: [{ key: "status", label: "待编制", tone: "warning" as const }] },
      ],
    }),
  ];
}

export function ConsolidationWorkpaperTab(props: ConsolidationWorkpaperTabProps) {
  const toolbarItems = usePeriodToolbar(props);
  const { activeView, data, error, loading, navigation, onRefresh } = props;
  const feedback = useFeedback();
  const [rateDraft, setRateDraft] = useState<StatementExchangeRateInput>(() => defaultRateDraft());
  const [savingRate, setSavingRate] = useState(false);

  useEffect(() => {
    if (!data?.fxPolicy.periodEndDate) return;
    setRateDraft((current) => current.rateKind === "closing"
      ? { ...current, rateDate: data.fxPolicy.periodEndDate }
      : current);
  }, [data?.fxPolicy.periodEndDate]);

  async function saveRate() {
    setSavingRate(true);
    try {
      const response = await fetch(workspacePath("/api/modules/finance/statements/consolidation/exchange-rates"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rateDraft),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "汇率证据保存失败");
      feedback.success(rateDraft.status === "verified" ? "汇率证据已保存并复核" : "汇率证据草稿已保存");
      setRateDraft(defaultRateDraft(data?.fxPolicy.periodEndDate));
      onRefresh();
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "汇率证据保存失败");
    } finally {
      setSavingRate(false);
    }
  }

  let sections: BodySurfaceSectionSpec[];
  if (!data) {
    sections = fallbackSections(error, loading);
  } else if (activeView === "ownership") {
    sections = ownershipSections(data);
  } else if (activeView === "sources") {
    sections = sourceSections(data);
  } else if (activeView === "eliminations") {
    sections = eliminationSections(data);
  } else if (activeView === "tax") {
    sections = taxSections(data);
  } else if (activeView === "review") {
    sections = reviewSections(data);
  } else if (activeView === "fx") {
    const rateFields: FormSurfaceFieldSpec[] = [
      {
        key: "rateKind",
        label: "汇率口径",
        required: true,
        spec: { valueType: "string", control: "choice", options: { source: "static", items: RATE_KIND_OPTIONS } },
        value: rateDraft.rateKind,
        onChange: (value) => setRateDraft((current) => ({
          ...current,
          rateKind: String(value) as StatementExchangeRateInput["rateKind"],
          rateDate: String(value) === "closing" ? data.fxPolicy.periodEndDate : current.rateDate,
        })),
      },
      {
        key: "rateDate",
        label: "牌价日期",
        required: true,
        spec: { valueType: "date", control: "temporal", precision: "date" },
        value: rateDraft.rateDate,
        onChange: (value) => setRateDraft((current) => ({ ...current, rateDate: String(value ?? "") })),
      },
      {
        key: "rate",
        label: "中行折算价（人民币/100外币）",
        required: true,
        spec: { valueType: "number", control: "number", validation: { min: 0.00000001 } },
        value: rateDraft.rate || "",
        step: 0.00000001,
        onChange: (value) => setRateDraft((current) => ({ ...current, rate: Number(value) })),
      },
      {
        key: "publishedAt",
        label: "牌价发布时间",
        required: rateDraft.status === "verified",
        spec: { valueType: "string", control: "text" },
        value: rateDraft.publishedAt ?? "",
        placeholder: "例如 2026-06-30T10:30:00+08:00",
        onChange: (value) => setRateDraft((current) => ({ ...current, publishedAt: String(value ?? "") || null })),
      },
      {
        key: "status",
        label: "处理状态",
        required: true,
        spec: { valueType: "string", control: "choice", options: { source: "static", items: [{ value: "draft", label: "保存草稿" }, { value: "verified", label: "保存并复核" }] } },
        value: rateDraft.status,
        onChange: (value) => setRateDraft((current) => ({ ...current, status: String(value) as StatementExchangeRateInput["status"] })),
      },
      {
        key: "sourceUrl",
        label: "中国银行来源页",
        required: true,
        span: 2,
        spec: { valueType: "string", control: "text" },
        value: rateDraft.sourceUrl,
        actions: [{ key: "open-boc", label: "打开牌价页", onClick: () => window.open(rateDraft.sourceUrl, "_blank", "noopener,noreferrer") }],
        onChange: (value) => setRateDraft((current) => ({ ...current, sourceUrl: String(value ?? "") })),
      },
      {
        key: "note",
        label: "复核说明",
        span: 3,
        spec: { valueType: "string", control: "text", multiline: true },
        value: rateDraft.note ?? "",
        rows: 2,
        onChange: (value) => setRateDraft((current) => ({ ...current, note: String(value ?? "") || null })),
      },
    ];
    sections = [
      createMessageSection("fx-processing-rule", {
        tone: data.fxPolicy.status === "ready" ? "muted" : "warning",
        content: `${data.fxPolicy.pair} 采用中国银行“中行折算价”，单位为人民币/100外币。系统不依赖无公开契约的网页抓取：保存牌价日期、发布时间、来源页、数值和复核人形成快照。${data.fxPolicy.note}`,
      }),
      createMetricsSection("fx-readiness", {
        metrics: [
          { key: "closing", label: "期末折算价", value: data.fxPolicy.closingRate ? `${data.fxPolicy.closingRate.rate.toFixed(4)} · 已复核` : "待复核" },
          { key: "historical", label: "投资日历史汇率", value: String(data.fxPolicy.historicalRateCount) },
          { key: "investment", label: "投资付款证据", value: String(data.fxPolicy.investmentEvidence.length) },
          { key: "missing", label: "缺原币/汇率", value: String(data.fxPolicy.missingInvestmentRateCount) },
        ],
      }),
      createFormSection("fx-rate-editor", {
        kind: "filters",
        header: { title: "录入并复核中国银行牌价", description: "期末资产负债使用期末/此前最近营业日牌价；投资历史成本使用每笔投资发生日牌价；平均汇率需有批准依据。" },
        content: { items: rateFields, layout: { flow: "grid", columns: 3, density: "compact", commandPlacement: "below" } },
        commands: [{ key: "save-rate", label: savingRate ? "正在保存…" : "保存汇率证据", type: "submit", variant: "primary", disabled: savingRate }],
        submit: { onSubmit: () => void saveRate() },
      }),
      createPageTableSection("fx-rate-snapshots", {
        rows: data.fxPolicy.rates,
        columns: exchangeRateColumns,
        visibleColumns: exchangeRateColumns.map((column) => column.key),
        rowKey: (row) => row.id,
        presentation: { density: "compact", cellWrap: "wrap" },
        emptyText: "尚未保存 CAD/CNY 汇率证据",
      }),
      createAnalysisSection("investment-payment-evidence", {
        title: "北美研究院投资付款与历史汇率",
        sections: [
          createMessageSection("investment-payment-help", {
            tone: data.fxPolicy.missingInvestmentRateCount > 0 ? "warning" : "muted",
            content: "以下付款直接从长期股权投资凭证识别。人民币入账金额是历史成本事实；缺少原币金额或投资日汇率时，需补银行付款单/投资凭证后再复核，不能用期末汇率替代。",
          }),
          createPageTableSection("investment-payment-table", {
            rows: data.fxPolicy.investmentEvidence,
            columns: investmentEvidenceColumns,
            visibleColumns: investmentEvidenceColumns.map((column) => column.key),
            rowKey: (row) => row.id,
            presentation: { density: "compact", cellWrap: "wrap" },
            scroll: { x: true },
            emptyText: "当前账内未识别到北美研究院投资付款",
          }),
        ],
      }),
      createListSection("fx-policy-list", {
        density: "compact",
        items: [
          { key: "assets-liabilities", title: "资产和负债", description: "按资产负债表日即期汇率；非营业日使用经复核的最近可用牌价并说明。", tone: "info" },
          { key: "historical-equity", title: "实收资本及历史成本权益事项", description: "按出资或交易发生日历史汇率；每笔投资付款独立留证。", tone: "info" },
          { key: "income-expense", title: "收入和费用", description: "按交易日汇率，或采用有依据且能够合理近似的期间平均汇率。", tone: "info" },
          { key: "retained-earnings", title: "未分配利润", description: "按期初余额和本期利润分配滚动，不直接套期末汇率。", tone: "info" },
          { key: "translation-difference", title: "外币报表折算差额", description: "在原币三表完整后由上述口径派生，并在所有者权益中单独列示。", tone: "warning" },
        ],
      }),
    ];
  } else {
    sections = overviewSections(data);
  }
  if (data && error) sections = [createMessageSection("consolidation-refresh-error", { tone: "danger", content: error }), ...sections];
  return <PageSurface kind="standard" tabbar={navigation} toolbar={{ items: toolbarItems }} body={createPageBody(sections)} />;
}

export function ConsolidatedReportTab(props: ConsolidationTabProps) {
  const toolbarItems = usePeriodToolbar(props);
  const { data, error, loading, navigation } = props;
  let sections: BodySurfaceSectionSpec[];
  if (!data) {
    sections = fallbackSections(error, loading);
  } else {
    sections = [
      createMessageSection("consolidated-output-status", { tone: "warning", content: data.outputMessage }),
      ...(error ? [createMessageSection("consolidated-refresh-error", { tone: "danger", content: error })] : []),
      createMetricsSection("consolidated-output-metrics", {
        metrics: [
          { key: "status", label: "发布状态", value: "未发布" },
          { key: "period", label: "报表期间", value: data.scope.periodLabel },
          { key: "entities", label: "合并实体", value: String(data.metrics.entityCount) },
          { key: "blockers", label: "未闭环控制", value: String(data.metrics.blockerCount) },
        ],
      }),
      createAnalysisSection("consolidated-report-list", { title: "母公司合并报表", sections: [reviewSections(data)[2]!] }),
      createAnalysisSection("consolidated-blockers", {
        title: "发布前检查",
        sections: [createPageTableSection("consolidated-blocker-table", {
          rows: data.checks,
          columns: consolidationCheckColumns,
          visibleColumns: consolidationCheckColumns.map((column) => column.key),
          rowKey: (row) => row.key,
          presentation: { density: "compact" },
          rowState: (row) => row.status === "blocked" ? "danger" : row.status === "attention" ? "warning" : "normal",
        })],
      }),
    ];
  }
  return <PageSurface kind="standard" tabbar={navigation} toolbar={{ items: toolbarItems }} body={createPageBody(sections)} />;
}
