"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { workspacePath } from "@workspace/core/routing";
import {
  createAnalysisSection,
  createListSection,
  createMasterDetailBody,
  createMessageSection,
  createMetricsSection,
  createPageBody,
  createPageTableSection,
  createPageTabBar,
  createStatusSection,
  PageSurface,
  useFeedback,
  type BodySurfaceSectionSpec,
  type DataSurfaceColumnSpec,
  type FormSurfaceItemSpec,
  type PageSurfaceCreateSpec,
  type SelectorSurfaceProps,
} from "@workspace/core/ui";
import {
  DEFAULT_MARKET_SUBSCRIPTION_IDS,
  MARKET_INSTRUMENT_IDS,
  MARKET_TREND_PERIODS,
  type MarketAssetClass,
  type MarketInstrument,
  type MarketInstrumentSnapshot,
  type MarketIntelligenceSnapshot,
  type MarketStockRegion,
  type MarketTrendPeriod,
} from "../types/market-intelligence";
import {
  filterMarketCatalog,
  marketStockCatalogSummary,
  marketStockSubscriptionId,
  mergeMarketCatalogInstruments,
  normalizeCustomStock,
  normalizeStoredMarketWatchlist,
  type MarketWatchlistState,
} from "./market-intelligence-state";
import { createMarketTrackingSections } from "./market-intelligence-stock-sections";
import { useMarketStockCatalog } from "./use-market-stock-catalog";

const ENDPOINT = "/api/modules/capitalSecurities/market-intelligence";
const STORAGE_KEY = "workspace.capital-securities.market-subscriptions.v2";
const LEGACY_STORAGE_KEY = "workspace.capital-securities.market-subscriptions.v1";
const REFRESH_INTERVAL_MS = 90_000;
const KNOWN_IDS = new Set<string>(MARKET_INSTRUMENT_IDS);

type MarketView = "watchlist" | "stock" | "catalog" | "analysis";
type StockDraft = { market: MarketStockRegion; symbol: string; name: string };

const VIEW_TABS = [
  { key: "stock", label: "自选行情" },
  { key: "watchlist", label: "订阅总览" },
  { key: "catalog", label: "市场目录" },
  { key: "analysis", label: "分析方法" },
] as const;
const ASSET_LABELS: Record<MarketAssetClass, string> = { index: "指数", commodity: "大宗商品", fx: "汇率", stock: "股票" };
const MARKET_LABELS = { CN: "A股 / 境内", HK: "港股", US: "美股", GLOBAL: "全球" } as const;
const TREND_PERIOD_LABELS: Record<MarketTrendPeriod, string> = { day: "日K", week: "周K", month: "月K", quarter: "季K", year: "年K" };

export default function MarketIntelligenceClient() {
  const feedback = useFeedback();
  const [view, setView] = useState<MarketView>("stock");
  const [snapshot, setSnapshot] = useState<MarketIntelligenceSnapshot | null>(null);
  const [watchlist, setWatchlist] = useState<MarketWatchlistState>({ instrumentIds: [...DEFAULT_MARKET_SUBSCRIPTION_IDS], stocks: [] });
  const [subscriptionsReady, setSubscriptionsReady] = useState(false);
  const [trackedInstrumentId, setTrackedInstrumentId] = useState("");
  const [trendPeriod, setTrendPeriod] = useState<MarketTrendPeriod>("day");
  const [mobileDetailActive, setMobileDetailActive] = useState(false);
  const [createDraft, setCreateDraft] = useState<StockDraft | null>(null);
  const [query, setQuery] = useState("");
  const [assetClass, setAssetClass] = useState<MarketAssetClass | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const stockCatalog = useMarketStockCatalog({
    active: view === "catalog" && (assetClass === "all" || assetClass === "stock"),
    query,
  });

  const load = useCallback(async (notifyOnError = false) => {
    if (!subscriptionsReady) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (watchlist.instrumentIds.length > 0) params.set("ids", watchlist.instrumentIds.join(","));
      if (watchlist.stocks.length > 0) params.set("stocks", JSON.stringify(watchlist.stocks));
      const response = await fetch(workspacePath(`${ENDPOINT}?${params.toString()}`), { cache: "no-store" });
      const payload = await response.json().catch(() => null) as MarketIntelligenceSnapshot | { error?: string } | null;
      if (!response.ok) throw new Error(apiError(payload, `市场情报加载失败 (${response.status})`));
      setSnapshot(payload as MarketIntelligenceSnapshot);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "市场情报加载失败";
      setError(message);
      if (notifyOnError) feedback.error(message);
    } finally {
      setLoading(false);
    }
  }, [feedback, subscriptionsReady, watchlist]);

  useEffect(() => {
    setWatchlist(normalizeStoredMarketWatchlist(
      window.localStorage.getItem(STORAGE_KEY),
      window.localStorage.getItem(LEGACY_STORAGE_KEY),
      MARKET_INSTRUMENT_IDS,
      DEFAULT_MARKET_SUBSCRIPTION_IDS,
    ));
    setSubscriptionsReady(true);
  }, []);

  useEffect(() => {
    if (!subscriptionsReady) return;
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load, subscriptionsReady]);

  const subscribed = useMemo(() => {
    const ids = new Set([...watchlist.instrumentIds, ...watchlist.stocks.map(marketStockSubscriptionId)]);
    return (snapshot?.instruments ?? []).filter((instrument) => ids.has(instrument.id));
  }, [snapshot?.instruments, watchlist]);
  const subscribedStocks = useMemo(() => subscribed.filter((instrument) => instrument.assetClass === "stock"), [subscribed]);
  const trackedInstrument = subscribed.find((instrument) => instrument.id === trackedInstrumentId) ?? subscribed[0] ?? null;
  const trackedInstrumentHasTrend = Boolean(trackedInstrument && MARKET_TREND_PERIODS.some((period) => trackedInstrument.trends[period].length > 0));
  const catalogInstruments = useMemo(() => mergeMarketCatalogInstruments(
    snapshot?.instruments ?? [],
    stockCatalog.result?.matches ?? [],
  ), [snapshot?.instruments, stockCatalog.result?.matches]);
  const filteredCatalog = useMemo(() => filterMarketCatalog(catalogInstruments, query, assetClass), [assetClass, catalogInstruments, query]);
  const navigation = useMemo(() => createPageTabBar({
    items: [...VIEW_TABS],
    active: view,
    onChange: (key) => {
      const next = key as MarketView;
      setView(next);
      if (next === "stock") setMobileDetailActive(false);
    },
    ariaLabel: "证券市场情报视图",
  }), [view]);
  const marketSelector = useMemo<SelectorSurfaceProps<MarketInstrumentSnapshot>>(() => ({
    kind: "list",
    title: `自选行情 · ${subscribed.length}`,
    items: subscribed.map((instrument) => ({
      key: instrument.id,
      value: instrument,
      card: {
        title: instrument.name,
        subtitle: `${ASSET_LABELS[instrument.assetClass]} · ${MARKET_LABELS[instrument.market]}`,
        code: instrument.symbol,
        trailing: instrument.quote ? formatNumber(instrument.quote.last) : "—",
        metaLine: instrument.reportReminder ? `${instrument.reportReminder.scheduledFor} 财报` : instrument.financial?.reportPeriod ?? instrument.delayLabel,
        status: {
          label: instrument.quote?.changePercent === null || instrument.quote?.changePercent === undefined ? "暂无涨跌" : `${signedNumber(instrument.quote.changePercent)}%`,
          tone: "default",
        },
      },
    })),
    selectedId: trackedInstrument?.id ?? null,
    loading: loading && !snapshot,
    loadingText: "正在加载自选行情",
    emptyText: error || "暂无自选，请到“市场目录”添加股票、指数、大宗商品或汇率",
    onSelect: (instrument) => {
      setTrackedInstrumentId(instrument.id);
      setMobileDetailActive(true);
    },
  }), [error, loading, snapshot, subscribed, trackedInstrument?.id]);

  useEffect(() => {
    if (trackedInstrument && trackedInstrument.id !== trackedInstrumentId) setTrackedInstrumentId(trackedInstrument.id);
  }, [trackedInstrument, trackedInstrumentId]);

  return (
    <PageSurface
      kind="standard"
      create={createSurface()}
      tabbar={navigation}
      toolbar={{ items: toolbarItems() }}
      body={view === "stock" ? stockWorkbenchBody() : createPageBody(pageSections())}
    />
  );

  function updateWatchlist(update: (current: MarketWatchlistState) => MarketWatchlistState) {
    setWatchlist((current) => {
      const next = update(current);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function toggleSubscription(instrumentId: string) {
    updateWatchlist((current) => {
      const custom = current.stocks.some((stock) => marketStockSubscriptionId(stock) === instrumentId);
      if (custom) return { ...current, stocks: current.stocks.filter((stock) => marketStockSubscriptionId(stock) !== instrumentId) };
      return { ...current, instrumentIds: current.instrumentIds.includes(instrumentId) ? current.instrumentIds.filter((id) => id !== instrumentId) : [...current.instrumentIds, instrumentId] };
    });
  }

  function toggleCatalogSubscription(instrument: MarketInstrument) {
    if (KNOWN_IDS.has(instrument.id)) {
      toggleSubscription(instrument.id);
      return;
    }
    if (instrument.assetClass !== "stock" || instrument.market === "GLOBAL") return;
    const stock = { market: instrument.market, symbol: instrument.symbol, name: instrument.name };
    updateWatchlist((current) => {
      const selected = current.stocks.some((item) => marketStockSubscriptionId(item) === instrument.id);
      return selected
        ? { ...current, stocks: current.stocks.filter((item) => marketStockSubscriptionId(item) !== instrument.id) }
        : { ...current, stocks: [...current.stocks, stock].slice(-8) };
    });
  }

  function addCustomStock() {
    if (!createDraft) throw new Error("请填写股票代码");
    const stock = normalizeCustomStock(createDraft);
    if (!stock) throw new Error("股票代码格式不正确");
    const id = marketStockSubscriptionId(stock);
    updateWatchlist((current) => KNOWN_IDS.has(id)
      ? { instrumentIds: Array.from(new Set([...current.instrumentIds, id])), stocks: current.stocks.filter((item) => marketStockSubscriptionId(item) !== id) }
      : { ...current, stocks: [...current.stocks.filter((item) => marketStockSubscriptionId(item) !== id), stock].slice(-8) });
    setTrackedInstrumentId(id);
    setMobileDetailActive(true);
    setCreateDraft(null);
    setView("stock");
  }

  function createSurface(): PageSurfaceCreateSpec | undefined {
    if (view !== "catalog") return undefined;
    const draft = createDraft ?? { market: "CN", symbol: "", name: "" };
    const normalized = normalizeCustomStock(draft);
    return {
      id: "market-stock-subscribe",
      presentation: "block",
      title: "订阅股票代码",
      open: Boolean(createDraft),
      canCreate: true,
      content: { kind: "sections", sections: [{ key: "market-stock-fields", items: stockCreateFields(draft, setCreateDraft), layout: { columns: 3 } }] },
      submission: { action: "save", disabled: !normalized, execute: async () => { addCustomStock(); return { outcome: "saved" as const, message: "股票已加入自选" }; } },
      onOpenChange: (open) => setCreateDraft(open ? { market: "CN", symbol: "", name: "" } : null),
      onCancel: () => setCreateDraft(null),
    };
  }

  function toolbarItems() {
    if (view === "catalog") return [
      { kind: "search" as const, key: "market-search", value: query, onChange: setQuery, placeholder: "搜索名称、代码或市场", scope: ["名称", "代码", "市场"] },
      { kind: "select" as const, key: "asset-class", label: "品类", value: assetClass, onChange: (value: string) => setAssetClass(value as MarketAssetClass | "all"), options: [{ value: "all", label: "全部品类" }, ...Object.entries(ASSET_LABELS).map(([value, label]) => ({ value, label }))] },
    ];
    const refresh = { kind: "action-group" as const, key: "market-actions", actions: [{ key: "refresh", kind: "refresh" as const, label: "刷新数据", disabled: loading, onClick: () => void load(true) }] };
    if (view === "stock" && trackedInstrumentHasTrend) {
      const periodControl = {
        kind: "option-group" as const,
        key: "stock-trend-period",
        value: trendPeriod,
        presentation: "segmented" as const,
        ariaLabel: "K线周期",
        options: MARKET_TREND_PERIODS.map((period) => ({ value: period, label: TREND_PERIOD_LABELS[period] })),
        onChange: (value: string) => setTrendPeriod(value as MarketTrendPeriod),
      };
      return [
        { ...periodControl, visibility: "desktop" as const },
        ...(mobileDetailActive ? [{ ...periodControl, key: "stock-trend-period-mobile", visibility: "mobile" as const }] : []),
        refresh,
      ];
    }
    return view === "watchlist" ? [refresh] : [];
  }

  function stockWorkbenchBody() {
    const detailSections = trackedInstrument
      ? [...statusMessages(snapshot?.provider, error), ...createMarketTrackingSections(trackedInstrument, snapshot?.reminderWindowDays ?? 14, trendPeriod)]
      : [createMessageSection("market-empty", { tone: "muted", content: loading ? "正在读取自选行情" : "先到“市场目录”订阅股票、指数、大宗商品或汇率，即可查看行情详情。" })];
    return createMasterDetailBody({
      master: { label: "自选", presentation: "compact", body: { kind: "selector", selector: marketSelector } },
      detail: createPageBody(detailSections),
      desktop: { ratio: [1, 2] },
      mobile: { detailActive: mobileDetailActive, onNavigateToList: () => setMobileDetailActive(false) },
    });
  }

  function pageSections(): BodySurfaceSectionSpec[] {
    if (view === "catalog") return catalogSections();
    if (view === "analysis") return analysisSections();
    if (loading && !snapshot) return [createStatusSection("market-loading", { kind: "loading", content: "正在读取订阅、行情与资讯" })];
    if (error && !snapshot) return [createStatusSection("market-error", { kind: "error", content: error })];
    return watchlistSections();
  }

  function watchlistSections(): BodySurfaceSectionSpec[] {
    const provider = snapshot?.provider;
    const availableCount = subscribed.filter((instrument) => instrument.quoteStatus === "available").length;
    const reminders = subscribed.filter((instrument) => instrument.reportReminder).sort((left, right) => left.reportReminder!.daysUntil - right.reportReminder!.daysUntil);
    return [
      ...statusMessages(provider, error),
      createMetricsSection("market-metrics", { metrics: [
        { key: "subscriptions", label: "订阅项目", value: subscribed.length },
        { key: "stocks", label: "自选股票", value: subscribedStocks.length },
        { key: "quotes", label: "已取得行情", value: `${availableCount} / ${subscribed.length}` },
        { key: "reports", label: "待披露财报", value: reminders.length },
      ] }),
      ...(reminders.length ? [{ ...createListSection("report-reminders", { presentation: "cards", density: "compact", items: reminders.map((instrument) => ({
        key: instrument.id,
        title: `${instrument.name} · ${instrument.reportReminder!.reportPeriod}`,
        description: `${formatReminderDay(instrument.reportReminder!.daysUntil)} · ${instrument.reportReminder!.sourceLabel}`,
        badges: [{ key: "date", label: instrument.reportReminder!.scheduledFor, tone: instrument.reportReminder!.daysUntil <= 3 ? "warning" : "info" }],
        tone: instrument.reportReminder!.daysUntil <= 3 ? "warning" : "info",
        onClick: () => { setTrackedInstrumentId(instrument.id); setMobileDetailActive(true); setView("stock"); },
      })) }), header: { title: "财报提醒" } } as BodySurfaceSectionSpec] : []),
      createMessageSection("market-notice", { tone: "muted", content: provider?.notice ?? "行情与分析仅供内部研究，不构成投资建议。" }),
      createPageTableSection("market-watchlist", {
        rows: subscribed,
        columns: quoteColumns(),
        visibleColumns: quoteColumns().map((column) => column.key),
        rowKey: (row) => row.id,
        rowActions: (row) => [{ key: `unsubscribe-${row.id}`, label: "取消订阅", kind: "cancel", onClick: () => toggleSubscription(row.id) }],
        actionsColumn: { label: "操作" },
        loading,
        emptyText: "暂无订阅，请到“市场目录”添加指数、商品、汇率或股票",
        presentation: { density: "compact", rowHover: "neutral" },
      }),
    ];
  }

  function catalogSections(): BodySurfaceSectionSpec[] {
    if (loading && !snapshot) return [createStatusSection("catalog-loading", { kind: "loading", content: "正在加载市场目录" })];
    if (error && !snapshot) return [createStatusSection("catalog-error", { kind: "error", content: error })];
    const selected = new Set([...watchlist.instrumentIds, ...watchlist.stocks.map(marketStockSubscriptionId)]);
    const catalogStatus = stockCatalog.loading
      ? [createStatusSection("stock-catalog-searching", { kind: "loading", content: "正在检索每日更新的 A股、港股与美股目录" })]
      : stockCatalog.error
        ? [createMessageSection("stock-catalog-error", { tone: "warning", content: `${stockCatalog.error}。固定市场目录仍可使用。` })]
        : stockCatalog.result
          ? [createMessageSection("stock-catalog-summary", { tone: stockCatalog.result.stale ? "warning" : "muted", content: marketStockCatalogSummary(stockCatalog.result) })]
          : [];
    const sections = (Object.keys(ASSET_LABELS) as MarketAssetClass[]).flatMap((kind) => {
      const items = filteredCatalog.filter((instrument) => instrument.assetClass === kind);
      if (items.length === 0) return [];
      return [{ ...createListSection(`market-catalog-${kind}`, { presentation: "cards", density: "compact", items: items.map((instrument) => ({
        key: instrument.id,
        title: instrument.name,
        description: instrument.description,
        badges: [{ key: "market", label: MARKET_LABELS[instrument.market], tone: "info" }, { key: "symbol", label: instrument.symbol, tone: "muted" }, { key: "delay", label: instrument.delayLabel, tone: instrument.market === "HK" ? "warning" : "default" }],
        tone: selected.has(instrument.id) ? "success" : "default",
        actions: [{ key: `subscribe-${instrument.id}`, label: selected.has(instrument.id) ? "取消订阅" : "订阅", icon: selected.has(instrument.id) ? "cancel" : "add", variant: selected.has(instrument.id) ? "secondary" : "primary", onClick: () => toggleCatalogSubscription(instrument) }],
      })), empty: { content: "没有符合条件的市场项目", presentation: "plain" } }), header: { title: ASSET_LABELS[kind] } }];
    });
    return [...catalogStatus, ...sections];
  }
}

function stockCreateFields(draft: StockDraft, setDraft: (value: StockDraft) => void): FormSurfaceItemSpec[] {
  return [
    { key: "market", label: "市场", spec: { valueType: "string", control: "choice", state: "required", options: { source: "static", items: [{ value: "CN", label: "A股" }, { value: "HK", label: "港股" }, { value: "US", label: "美股" }] } }, value: draft.market, onChange: (value) => setDraft({ ...draft, market: String(value) as MarketStockRegion, symbol: "" }) },
    { key: "symbol", label: "股票代码", spec: { valueType: "string", control: "text", state: "required" }, value: draft.symbol, onChange: (value) => setDraft({ ...draft, symbol: String(value ?? "") }) },
    { key: "name", label: "显示名称（可选）", spec: { valueType: "string", control: "text", state: "normal" }, value: draft.name, onChange: (value) => setDraft({ ...draft, name: String(value ?? "") }) },
  ];
}

function quoteColumns(): DataSurfaceColumnSpec<MarketInstrumentSnapshot>[] {
  return [
    { key: "instrument", label: "项目", required: true, defaultVisible: true, cell: (row) => ({ kind: "stack", items: [{ kind: "text", value: row.name, emphasis: "medium" }, { kind: "text", value: row.symbol, tone: "muted", font: "mono" }] }) },
    { key: "class", label: "品类 / 市场", defaultVisible: true, cell: (row) => ({ kind: "stack", items: [{ kind: "badge", label: ASSET_LABELS[row.assetClass], tone: "amber" }, { kind: "text", value: MARKET_LABELS[row.market], tone: "muted" }] }) },
    { key: "last", label: "最新", defaultVisible: true, align: "right", numeric: true, cell: (row) => row.quote ? { kind: "number", value: row.quote.last, maximumFractionDigits: row.assetClass === "fx" ? 4 : 2 } : { kind: "empty", content: "—" } },
    { key: "change", label: "涨跌", defaultVisible: true, align: "right", cell: (row) => changeCell(row) },
    { key: "report", label: "财报提醒", defaultVisible: true, cell: (row) => row.reportReminder ? ({ kind: "badge", label: `${row.reportReminder.scheduledFor} · ${formatReminderDay(row.reportReminder.daysUntil)}`, tone: row.reportReminder.daysUntil <= 3 ? "amber" : "blue" }) : "—" },
    { key: "status", label: "状态", defaultVisible: true, cell: (row) => ({ kind: "badge", label: row.quoteStatus === "available" ? row.delayLabel : row.quoteStatus === "missing" ? "暂无匹配行情" : "行情源不可用", tone: row.quoteStatus === "available" ? "green" : row.quoteStatus === "missing" ? "slate" : "red" }) },
  ];
}

function changeCell(row: MarketInstrumentSnapshot) {
  const quote = row.quote;
  if (!quote) return { kind: "empty" as const, content: "—" };
  const tone = (quote.changePercent ?? quote.change ?? 0) > 0 ? "success" as const : (quote.changePercent ?? quote.change ?? 0) < 0 ? "danger" as const : "muted" as const;
  return { kind: "stack" as const, items: [{ kind: "text" as const, value: signedNumber(quote.change), tone }, { kind: "text" as const, value: quote.changePercent === null ? "—" : `${signedNumber(quote.changePercent)}%`, tone }] };
}

function statusMessages(provider: MarketIntelligenceSnapshot["provider"] | undefined, error: string) {
  return [
    ...(error ? [createMessageSection("market-refresh-error", { tone: "warning", content: `${error}。继续展示上次成功数据。` })] : []),
    ...(provider && provider.state !== "ready" ? [createMessageSection("provider-status", { tone: provider.state === "unconfigured" ? "muted" : "warning", content: `${provider.statusLabel}。${provider.state === "unconfigured" ? "配置 MARKET_INTELLIGENCE_AKTOOLS_BASE_URL 后启用开源数据。" : "系统保留订阅，并在下次轮询自动恢复。"}` })] : []),
  ];
}

function analysisSections(): BodySurfaceSectionSpec[] {
  return [
    createMessageSection("analysis-boundary", { tone: "muted", content: "分析输出应同时标注数据源、行情时间、比较基准和缺失区间；不把模型结论当作交易指令。" }),
    createAnalysisSection("analysis-built-in", { title: "内建确定性分析", sections: [createListSection("analysis-built-in-list", { presentation: "cards", density: "compact", items: [
      { key: "trend", title: "趋势与动量", description: "近一年日 K 及周/月/季/年 K、成交量、区间收益与 MA5/10/20/30；全部由本地缓存的同一日线序列复算。", badges: [{ key: "status", label: "已落地", tone: "success" }] },
      { key: "risk", title: "波动与回撤", description: "年化波动率、最大回撤、下行波动和缺口检测；下一阶段用于风险提示。", badges: [{ key: "status", label: "后续", tone: "muted" }] },
    ] })] }),
    createAnalysisSection("analysis-open-source", { title: "开源分析能力候选", sections: [createListSection("analysis-open-source-list", { presentation: "cards", density: "compact", items: [
      { key: "lightweight-charts", title: "TradingView Lightweight Charts", description: "面向金融行情的 Canvas 图表库，支持 K 线、成交量、折线、十字线和增量更新；接入时需保留 NOTICE 与产品归属链接。", badges: [{ key: "license", label: "Apache-2.0", tone: "info" }, { key: "fit", label: "可选渲染器", tone: "success" }] },
      { key: "ta-lib", title: "TA-Lib", description: "成熟的技术指标与形态识别库，可用于 RSI、MACD、布林带等服务端复算；本初稿的 MA 由 Core 直接确定性计算。", badges: [{ key: "license", label: "BSD", tone: "info" }, { key: "fit", label: "指标扩展", tone: "success" }] },
      { key: "openbb", title: "OpenBB ODP", description: "适合作为多 provider 研究层；部分 provider 仍需独立密钥或授权。", badges: [{ key: "license", label: "AGPLv3", tone: "info" }] },
      { key: "octagon", title: "Octagon financial skills", description: "包含市场、财务指标和 SEC 分析 skill；MIT，但运行依赖 Octagon MCP 与 API Key。", badges: [{ key: "license", label: "MIT", tone: "info" }, { key: "fit", label: "需外部服务", tone: "warning" }] },
      { key: "internal", title: "Workspace 市场分析 skill", description: "建议只读取本 L2 受保护事实并输出可追溯结论，最符合现有权限边界。", badges: [{ key: "fit", label: "推荐", tone: "success" }] },
    ] })] }),
  ];
}

function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(value);
}
function signedNumber(value: number | null) { if (value === null) return "—"; const formatted = formatNumber(value); return value > 0 ? `+${formatted}` : formatted; }
function formatReminderDay(days: number) { return days === 0 ? "今天" : days === 1 ? "明天" : `${days} 天后`; }
function apiError(payload: unknown, fallback: string) { return payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : fallback; }
