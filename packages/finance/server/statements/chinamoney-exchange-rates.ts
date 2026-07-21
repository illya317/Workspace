const LATEST_URL = "https://www.chinamoney.com.cn/r/cms/www/chinamoney/data/fx/ccpr.json";
const HISTORY_URL = "https://www.chinamoney.com.cn/ags/ms/cm-u-bk-ccpr/CcprHisNew";

const SPECIAL_SOURCE_PAIRS: Record<string, string> = {
  JPY: "100JPY/CNY",
  MOP: "CNY/MOP",
};

interface SourceQuote {
  sourcePair: string;
  rateDate: string;
  price: number;
}

export interface ChinaMoneyCentralParityQuote extends SourceQuote {
  baseCurrency: string;
  quoteCurrency: "CNY";
  rate: number;
  sourceUnit: number;
  sourceUrl: string;
}

export class ChinaMoneyRateError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

function dateText(value: unknown) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? ""));
  return match?.[1] ?? null;
}

function positiveNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeChinaMoneyQuote(quote: SourceQuote): ChinaMoneyCentralParityQuote {
  const compactPair = quote.sourcePair.replaceAll(" ", "").toUpperCase();
  const match = /^(\d+)?([A-Z]{3})\/([A-Z]{3})$/.exec(compactPair);
  if (!match) throw new ChinaMoneyRateError(`中国货币网返回了无法识别的币种对：${quote.sourcePair}`);
  const sourceUnit = Number(match[1] ?? 1);
  const sourceBase = match[2]!;
  const sourceQuote = match[3]!;
  if (sourceBase !== "CNY" && sourceQuote !== "CNY") {
    throw new ChinaMoneyRateError(`中国货币网币种对不含人民币：${quote.sourcePair}`);
  }
  if (sourceBase === "CNY" && sourceQuote === "CNY") {
    throw new ChinaMoneyRateError("人民币自身不需要外币折算汇率");
  }
  const baseCurrency = sourceBase === "CNY" ? sourceQuote : sourceBase;
  const rate = sourceQuote === "CNY" ? quote.price / sourceUnit : sourceUnit / quote.price;
  if (!Number.isFinite(rate) || rate <= 0) throw new ChinaMoneyRateError(`中国货币网汇率无效：${quote.price}`);
  return {
    ...quote,
    baseCurrency,
    quoteCurrency: "CNY",
    rate,
    sourceUnit,
    sourcePair: compactPair,
    sourceUrl: "",
  };
}

function latestQuote(payload: unknown, currencyCode: string): SourceQuote | null {
  const root = payload as { data?: { records?: unknown[]; lastDate?: unknown }; records?: unknown[]; lastDate?: unknown };
  const records = root.data?.records ?? root.records ?? [];
  const rateDate = dateText(root.data?.lastDate ?? root.lastDate);
  if (!rateDate || !Array.isArray(records)) return null;
  for (const record of records) {
    const row = record as { vrtEName?: unknown; price?: unknown };
    const sourcePair = String(row.vrtEName ?? "");
    const price = positiveNumber(row.price);
    if (!price) continue;
    try {
      const normalized = normalizeChinaMoneyQuote({ sourcePair, rateDate, price });
      if (normalized.baseCurrency === currencyCode) return { sourcePair, rateDate, price };
    } catch (cause) {
      if (!(cause instanceof ChinaMoneyRateError)) throw cause;
    }
  }
  return null;
}

function historicalQuote(payload: unknown, sourcePair: string, targetDate: string): SourceQuote | null {
  const root = payload as {
    data?: { searchlist?: unknown[]; records?: unknown[] };
    searchlist?: unknown[];
    records?: unknown[];
  };
  const searchlist = root.data?.searchlist ?? root.searchlist ?? [];
  const records = root.data?.records ?? root.records ?? [];
  const pairIndex = Array.isArray(searchlist)
    ? searchlist.findIndex((item) => String(item).replaceAll(" ", "").toUpperCase() === sourcePair)
    : -1;
  if (pairIndex < 0 || !Array.isArray(records)) return null;
  return records.flatMap((record) => {
    const row = record as { date?: unknown; values?: unknown[] };
    const rateDate = dateText(row.date);
    const price = positiveNumber(row.values?.[pairIndex]);
    return rateDate && rateDate <= targetDate && price ? [{ sourcePair, rateDate, price }] : [];
  }).sort((left, right) => right.rateDate.localeCompare(left.rateDate))[0] ?? null;
}

function shanghaiToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function historyStartDate(targetDate: string) {
  const date = new Date(`${targetDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 31);
  return date.toISOString().slice(0, 10);
}

async function fetchJson(url: string, fetcher: typeof fetch) {
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "zh-CN,zh;q=0.9",
        Referer: "https://www.chinamoney.com.cn/chinese/bkccpr/",
        "User-Agent": "Mozilla/5.0 (compatible; WorkspaceFinance/1.0; +https://www.chinamoney.com.cn/)",
      },
    });
  } catch (cause) {
    throw new ChinaMoneyRateError(`中国货币网汇率抓取失败，请重试：${cause instanceof Error ? cause.message : "网络异常"}`);
  }
  if (!response.ok) throw new ChinaMoneyRateError(`中国货币网汇率抓取失败（HTTP ${response.status}），请重试`);
  try {
    return await response.json() as unknown;
  } catch {
    throw new ChinaMoneyRateError("中国货币网返回内容无法解析，请重试");
  }
}

export async function fetchChinaMoneyCentralParity(input: {
  currencyCode: string;
  targetDate: string;
  fetcher?: typeof fetch;
}): Promise<ChinaMoneyCentralParityQuote> {
  const currencyCode = input.currencyCode.toUpperCase();
  const fetcher = input.fetcher ?? fetch;
  const sourcePair = SPECIAL_SOURCE_PAIRS[currencyCode] ?? `${currencyCode}/CNY`;
  let sourceQuote: SourceQuote | null;
  let sourceUrl: string;
  if (input.targetDate >= shanghaiToday()) {
    sourceUrl = LATEST_URL;
    sourceQuote = latestQuote(await fetchJson(sourceUrl, fetcher), currencyCode);
  } else {
    const url = new URL(HISTORY_URL);
    url.searchParams.set("startDate", historyStartDate(input.targetDate));
    url.searchParams.set("endDate", input.targetDate);
    url.searchParams.set("currency", sourcePair);
    url.searchParams.set("pageNum", "1");
    url.searchParams.set("pageSize", "20");
    sourceUrl = url.toString();
    sourceQuote = historicalQuote(await fetchJson(sourceUrl, fetcher), sourcePair, input.targetDate);
  }
  if (!sourceQuote) {
    throw new ChinaMoneyRateError(`中国货币网没有返回 ${currencyCode} 在 ${input.targetDate} 前可用的人民币汇率中间价，请重试`);
  }
  const normalized = normalizeChinaMoneyQuote(sourceQuote);
  if (normalized.baseCurrency !== currencyCode) {
    throw new ChinaMoneyRateError(`中国货币网返回币种 ${normalized.baseCurrency}，与请求 ${currencyCode} 不一致`);
  }
  return { ...normalized, sourceUrl };
}
