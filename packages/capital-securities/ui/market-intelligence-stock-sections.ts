import {
  createAnalysisSection,
  createListSection,
  createMessageSection,
  createMetricsSection,
  createPageTableSection,
  createVisualizationSection,
  type BodySurfaceSectionSpec,
  type DataSurfaceColumnSpec,
} from "@workspace/core/ui";

import type {
  MarketFinancialSummary,
  MarketInstrumentSnapshot,
  MarketNewsItem,
  MarketTrendPeriod,
  MarketTrendPoint,
} from "../types/market-intelligence";

const MARKET_LABELS = { CN: "A股 / 境内", HK: "港股", US: "美股", GLOBAL: "全球" } as const;
const ASSET_LABELS = { index: "指数", commodity: "大宗商品", fx: "汇率", stock: "股票" } as const;
const PERIOD_META: Record<MarketTrendPeriod, { label: string; window: string }> = {
  day: { label: "日 K", window: "最近 1 年" },
  week: { label: "周 K", window: "最近 3 年" },
  month: { label: "月 K", window: "最近 5 年" },
  quarter: { label: "季 K", window: "最近 10 年" },
  year: { label: "年 K", window: "最近 10 年" },
};

/** @ui-structural-declaration Complete market quote, period K-line and stock-only disclosure detail. */
export function createMarketTrackingSections(
  instrument: MarketInstrumentSnapshot,
  reminderWindowDays: number,
  period: MarketTrendPeriod,
): BodySurfaceSectionSpec[] {
  const series = instrument.trends[period];
  const daily = instrument.trends.day;
  const trendChange = daily.length > 1 ? (daily.at(-1)!.close / daily[0]!.close - 1) * 100 : null;
  const candles = series.flatMap((point) => point.open === null || point.high === null || point.low === null ? [] : [{
    key: point.date,
    label: candleLabel(point.date, period),
    open: point.open,
    high: point.high,
    low: point.low,
    close: point.close,
    volume: point.volume,
  }]);
  const reminder = instrument.reportReminder;
  const financial = instrument.financial;
  const quote = instrument.quote;
  const periodMeta = PERIOD_META[period];
  const dateRange = series.length ? `${series[0]!.date} — ${series.at(-1)!.date}` : "暂无区间";
  const observedAt = quote ? formatObservedAt(quote.observedAt) : "暂无行情时间";
  const trendSections: BodySurfaceSectionSpec[] = series.length ? [
    createVisualizationSection("market-trend", { kind: "chart", chart: {
      frame: { title: `${instrument.name} · ${periodMeta.label}`, subtitle: `${MARKET_LABELS[instrument.market]} ${instrument.symbol} · ${periodMeta.window} · ${dateRange} · 未复权` },
      visual: { kind: "candlestick", points: candles, movingAveragePeriods: [5, 10, 20, 30], directionConvention: "red-up", height: 390, volumeLabel: "成交量", emptyText: `暂无完整 ${periodMeta.label} OHLC 数据` },
    } }),
    { ...createPageTableSection("market-trend-table", { rows: [...series].reverse().slice(0, 10), columns: trendColumns(), visibleColumns: trendColumns().map((column) => column.key), rowKey: (row) => row.date, emptyText: `暂无${periodMeta.label}走势`, presentation: { density: "compact", rowHover: "neutral" } }), visibility: "desktop" as const },
  ] : [createMessageSection("market-trend-empty", { tone: "muted", content: `${instrument.name} 暂未取得可绘制的历史 K 线，仍展示当前行情。` })];
  return [
    { ...createListSection("market-summary-mobile", {
      presentation: "list",
      density: "compact",
      items: [
        {
          key: `${instrument.id}-identity`,
          title: instrument.name,
          description: `${ASSET_LABELS[instrument.assetClass]} · ${MARKET_LABELS[instrument.market]} · ${instrument.symbol} · ${instrument.currency}`,
          meta: `${observedAt} · ${instrument.delayLabel}`,
          trailing: `${formatNumber(quote?.last)}  ${formatPercent(quote?.changePercent)}`,
        },
        {
          key: `${instrument.id}-session`,
          title: `开 ${formatNumber(quote?.open)} · 高 ${formatNumber(quote?.high)}`,
          description: `低 ${formatNumber(quote?.low)} · 昨收 ${formatNumber(quote?.previousClose)}`,
          meta: `涨跌额 ${formatSignedNumber(quote?.change)} · 成交量 ${formatCompactNumber(quote?.volume)}`,
          badges: [{ key: "range", label: `近1年 ${formatPercent(trendChange)}`, tone: "info" }],
          trailing: reminder ? `${formatReminderDay(reminder.daysUntil)}财报` : undefined,
        },
      ],
    }), visibility: "mobile" as const },
    { ...createMetricsSection("market-summary-desktop", { metrics: [
      { key: "last", label: "最新收盘", value: formatNumber(quote?.last) },
      { key: "change", label: "当日涨跌", value: formatPercent(quote?.changePercent) },
      { key: "open", label: "开盘", value: formatNumber(quote?.open) },
      { key: "high", label: "最高", value: formatNumber(quote?.high) },
      { key: "low", label: "最低", value: formatNumber(quote?.low) },
      { key: "volume", label: "成交量", value: formatCompactNumber(quote?.volume) },
    ] }), visibility: "desktop" as const },
    ...trendSections,
    ...(instrument.assetClass === "stock" ? [
      createAnalysisSection("stock-financial", { title: "财报与提醒", sections: [
        reminder
          ? createMessageSection("report-reminder", { tone: reminder.daysUntil <= 3 ? "warning" : "default", content: `${instrument.name} ${reminder.reportPeriod}预计于 ${reminder.scheduledFor} 披露（${formatReminderDay(reminder.daysUntil)}）${reminder.timingLabel && reminder.timingLabel !== "--" ? `，${reminder.timingLabel}` : ""}。来源：${reminder.sourceLabel}。` })
          : createMessageSection("report-reminder-empty", { tone: "muted", content: `${instrument.market === "CN" ? "当前报告期" : `未来 ${reminderWindowDays} 天`}未取得公开财报日程；仍会展示最近已披露财务摘要。` }),
        ...financialSections(financial, instrument.currency),
      ] }),
      createAnalysisSection("stock-news", { title: "NEWS · 最新动态", sections: [
        { ...createListSection("stock-news-mobile", { presentation: "list", density: "compact", items: instrument.news.map((item) => ({
          key: item.key,
          title: item.title,
          description: item.summary || undefined,
          meta: `${item.source} · ${formatObservedAt(item.publishedAt)}`,
          actions: item.url ? [{ key: `open-${item.key}`, label: "打开原文", icon: "open", onClick: () => openExternal(item.url!) }] : undefined,
        })), empty: { content: "暂未取得该股票的最新动态", presentation: "plain" } }), visibility: "mobile" as const },
        { ...createPageTableSection("stock-news-table", { rows: instrument.news, columns: newsColumns(), visibleColumns: newsColumns().map((column) => column.key), rowKey: (row) => row.key, emptyText: "暂未取得该股票的最新动态", presentation: { density: "compact", cellWrap: "wrap", rowHover: "neutral" } }), visibility: "desktop" as const },
      ] }),
    ] : []),
  ];
}

function financialSections(financial: MarketFinancialSummary | null, currency: string): BodySurfaceSectionSpec[] {
  if (!financial) return [createMessageSection("financial-empty", { tone: "muted", content: "暂未取得最近财务摘要，后续轮询会自动重试。" })];
  return [
    { ...createMetricsSection("financial-metrics", { metrics: [
      { key: "period", label: "最近报告期", value: financial.reportPeriod },
      { key: "revenue", label: "营业收入", value: formatCompactAmount(financial.revenue, currency) },
      { key: "revenue-yoy", label: "收入同比", value: formatPercent(financial.revenueYoY) },
      { key: "profit", label: "归母净利润", value: formatCompactAmount(financial.netProfit, currency) },
      { key: "profit-yoy", label: "利润同比", value: formatPercent(financial.netProfitYoY) },
      { key: "eps", label: "基本每股收益", value: formatNumber(financial.basicEps) },
    ] }), visibility: "desktop" as const },
    { ...createListSection("financial-mobile", { presentation: "list", density: "compact", items: [{
      key: financial.reportPeriod,
      title: financial.reportPeriod,
      description: `营收 ${formatCompactAmount(financial.revenue, currency)}（${formatPercent(financial.revenueYoY)}） · 归母净利润 ${formatCompactAmount(financial.netProfit, currency)}（${formatPercent(financial.netProfitYoY)}）`,
      meta: `基本每股收益 ${formatNumber(financial.basicEps)} · ${financial.sourceLabel}`,
    }] }), visibility: "mobile" as const },
  ];
}

function trendColumns(): DataSurfaceColumnSpec<MarketTrendPoint>[] {
  return [
    { key: "date", label: "日期", required: true, cell: (row) => row.date },
    { key: "open", label: "开盘", numeric: true, align: "right", cell: (row) => row.open === null ? "—" : ({ kind: "number", value: row.open, maximumFractionDigits: 4 }) },
    { key: "high", label: "最高", numeric: true, align: "right", cell: (row) => row.high === null ? "—" : ({ kind: "number", value: row.high, maximumFractionDigits: 4 }) },
    { key: "low", label: "最低", numeric: true, align: "right", cell: (row) => row.low === null ? "—" : ({ kind: "number", value: row.low, maximumFractionDigits: 4 }) },
    { key: "close", label: "收盘", numeric: true, align: "right", cell: (row) => ({ kind: "number", value: row.close, maximumFractionDigits: 4 }) },
    { key: "change", label: "涨跌", align: "right", cell: (row) => formatPercent(row.changePercent) },
    { key: "volume", label: "成交量", numeric: true, align: "right", cell: (row) => formatCompactNumber(row.volume) },
  ];
}

function newsColumns(): DataSurfaceColumnSpec<MarketNewsItem>[] {
  return [
    { key: "title", label: "动态", required: true, width: "wide", wrap: "wrap", cell: (row) => row.url ? { kind: "link", label: row.title, href: row.url, external: true } : ({ kind: "text", value: row.title, emphasis: "medium" }) },
    { key: "summary", label: "摘要", width: "wide", wrap: "wrap", cell: (row) => row.summary || "—" },
    { key: "source", label: "来源", cell: (row) => row.source },
    { key: "publishedAt", label: "时间", cell: (row) => formatObservedAt(row.publishedAt) },
  ];
}

function candleLabel(date: string, period: MarketTrendPeriod) {
  if (period === "year") return date.slice(0, 4);
  if (period === "quarter") return `${date.slice(0, 4)}Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`;
  return period === "month" ? date.slice(0, 7) : date.slice(5);
}

function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(value);
}
function formatSignedNumber(value: number | null | undefined) { return value === null || value === undefined ? "—" : signedNumber(value); }
function formatPercent(value: number | null | undefined) { return value === null || value === undefined ? "—" : `${signedNumber(value)}%`; }
function signedNumber(value: number) { const formatted = formatNumber(value); return value > 0 ? `+${formatted}` : formatted; }
function formatCompactNumber(value: number | null | undefined) { return value === null || value === undefined ? "—" : new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 2 }).format(value); }
function formatCompactAmount(value: number | null, currency: string) { return value === null ? "—" : new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 2, style: "currency", currency }).format(value); }
function formatReminderDay(days: number) { return days === 0 ? "今天" : days === 1 ? "明天" : `${days} 天后`; }
function formatObservedAt(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(parsed); }
function openExternal(url: string) { window.open(url, "_blank", "noopener,noreferrer"); }
