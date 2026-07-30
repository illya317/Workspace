import { createHash } from "node:crypto";

import type { NewsBriefing, NewsItem, NewsItemKind } from "../../types";

const DEFAULT_PROVIDER_PATH = "/news/";
const FETCH_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;

type ProviderFetch = (url: URL, init: RequestInit) => Promise<Response>;

function isSafeProviderUrl(url: URL) {
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  return url.protocol === "https:" || (url.protocol === "http:" && loopback);
}

export function resolveNewsProviderUrl(env: Partial<Pick<NodeJS.ProcessEnv, "NEWS_PROVIDER_URL" | "WORKSPACE_PUBLIC_ORIGIN">> = process.env) {
  const configured = env.NEWS_PROVIDER_URL?.trim();
  const base = configured || env.WORKSPACE_PUBLIC_ORIGIN?.trim();
  if (!base) return null;
  try {
    const url = configured ? new URL(configured) : new URL(DEFAULT_PROVIDER_PATH, base);
    return isSafeProviderUrl(url) ? url.toString() : null;
  } catch {
    return null;
  }
}

export interface NewsSourcePort {
  getLatestBriefing(): Promise<Omit<NewsBriefing, "reactions">>;
}

function decodeHtml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'");
}

function textContent(value: string) {
  return decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function capture(block: string, className: string) {
  const pattern = new RegExp(`<([a-z][\\w-]*)[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, "i");
  return pattern.exec(block)?.[2] ?? "";
}

function captureAll(block: string, className: string) {
  const pattern = new RegExp(`<([a-z][\\w-]*)[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, "gi");
  return [...block.matchAll(pattern)].map((match) => textContent(match[2] ?? "")).filter(Boolean);
}

function safeUrl(value: string, sourceUrl: string) {
  if (!value) return null;
  try {
    const url = new URL(decodeHtml(value), sourceUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function stableItemKey(source: string, title: string, url: string | null) {
  const identity = [source.trim().toLocaleLowerCase(), title.trim().toLocaleLowerCase(), url ?? ""].join("\n");
  return createHash("sha256").update(identity).digest("hex");
}

function parseScore(value: string) {
  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function reportIdFrom(sourceUrl: string, generatedAt: string | null) {
  const pathname = new URL(sourceUrl).pathname.replace(/\/+$/, "");
  const id = pathname.split("/").at(-1);
  return id && id !== "news" ? id : createHash("sha256").update(generatedAt ?? sourceUrl).digest("hex").slice(0, 16);
}

function parseItem(block: string, kind: NewsItemKind, reportId: string, sourceUrl: string): NewsItem | null {
  const titleClass = kind === "featured" ? "news-title" : "brief-title";
  const sourceClass = kind === "featured" ? "news-source" : "brief-source";
  const summaryClass = kind === "featured" ? "news-summary" : "brief-summary";
  const scoreClass = kind === "featured" ? "news-score" : "brief-score";
  const titleHtml = capture(block, titleClass);
  const title = textContent(titleHtml);
  if (!title) return null;
  const href = /<a\b[^>]*href=["']([^"']+)["']/i.exec(titleHtml)?.[1] ?? "";
  const url = safeUrl(href, sourceUrl);
  const source = textContent(capture(block, sourceClass)) || "未知来源";
  return {
    itemKey: stableItemKey(source, title, url),
    reportId,
    kind,
    title,
    url,
    source,
    summary: textContent(capture(block, summaryClass)),
    tags: captureAll(block, "tag"),
    score: parseScore(textContent(capture(block, scoreClass))),
  };
}

function articleBlocks(html: string, className: string) {
  const pattern = new RegExp(`<article\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>[\\s\\S]*?<\\/article>`, "gi");
  return html.match(pattern) ?? [];
}

export function parseHotsearchHtml(html: string, sourceUrl: string): Omit<NewsBriefing, "reactions"> {
  const title = textContent(/<header\b[^>]*>[\s\S]*?<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? "") || "每日简报";
  const generatedAt = textContent(capture(html, "date")) || null;
  const reportId = reportIdFrom(sourceUrl, generatedAt);
  const featured = articleBlocks(html, "news-card")
    .map((block) => parseItem(block, "featured", reportId, sourceUrl))
    .filter((item): item is NewsItem => Boolean(item));
  const brief = articleBlocks(html, "brief-item")
    .map((block) => parseItem(block, "brief", reportId, sourceUrl))
    .filter((item): item is NewsItem => Boolean(item));
  const items = [...featured, ...brief];
  if (items.length === 0) throw new Error("hotsearch 页面未包含可识别的资讯条目");
  return { reportId, title, generatedAt, sourceUrl, freshness: "fresh", items };
}

async function readLimitedHtml(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error("hotsearch 响应超过大小限制");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let html = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("hotsearch 响应超过大小限制");
    }
    html += decoder.decode(chunk.value, { stream: true });
  }
  return html + decoder.decode();
}

async function fetchProviderHtml(providerUrl: string, fetchImpl: ProviderFetch) {
  const initialUrl = new URL(providerUrl);
  if (!isSafeProviderUrl(initialUrl)) throw new Error("NEWS_PROVIDER_URL 无效");
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetchImpl(currentUrl, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: "text/html" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) throw new Error("hotsearch 重定向无效");
      const nextUrl = new URL(location, currentUrl);
      if (nextUrl.origin !== initialUrl.origin || !isSafeProviderUrl(nextUrl)) {
        throw new Error("hotsearch 不允许跨源重定向");
      }
      currentUrl = nextUrl;
      continue;
    }
    if (!response.ok) throw new Error(`hotsearch 返回 ${response.status}`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html")) throw new Error("hotsearch 返回了非 HTML 内容");
    return { html: await readLimitedHtml(response), sourceUrl: currentUrl.toString() };
  }
  throw new Error("hotsearch 重定向次数过多");
}

export class HotsearchHtmlAdapter implements NewsSourcePort {
  constructor(
    private readonly providerUrl = resolveNewsProviderUrl(),
    private readonly fetchImpl: ProviderFetch = fetch,
  ) {}

  async getLatestBriefing() {
    if (!this.providerUrl) throw new Error("NEWS_PROVIDER_URL 未配置");
    const result = await fetchProviderHtml(this.providerUrl, this.fetchImpl);
    return parseHotsearchHtml(result.html, result.sourceUrl);
  }
}
