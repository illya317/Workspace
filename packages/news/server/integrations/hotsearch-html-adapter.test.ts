import assert from "node:assert/strict";
import test from "node:test";

import {
  HotsearchHtmlAdapter,
  parseHotsearchHtml,
  resolveNewsProviderUrl,
} from "./hotsearch-html-adapter";

const html = `
<header><h1>消息速递</h1><div class="date">2026-07-30 20:10</div></header>
<article class="news-card" data-id="deep-0">
  <h2 class="news-title"><a href="https://example.com/story?a=1&amp;b=2">重点 &amp; 进展</a></h2>
  <div class="news-meta">
    <span class="news-source">GitHub</span><span class="news-score">9.4分</span>
    <div class="news-tags"><span class="tag">AI</span><span class="tag">产品</span></div>
  </div>
  <p class="news-summary">一条 <strong>重点</strong> 摘要。</p>
</article>
<article class="brief-item" data-id="brief-0">
  <h3 class="brief-title">无链接简报</h3>
  <p class="brief-summary">简短内容</p>
  <div class="brief-meta"><span class="brief-source">内部</span><span class="brief-score">7分</span></div>
</article>`;

test("parses the current hotsearch HTML into a stable Workspace contract", () => {
  const result = parseHotsearchHtml(html, "https://fh-bio.cn/news/202607302010");
  assert.equal(result.reportId, "202607302010");
  assert.equal(result.generatedAt, "2026-07-30 20:10");
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items[0], {
    itemKey: result.items[0]?.itemKey,
    reportId: "202607302010",
    kind: "featured",
    title: "重点 & 进展",
    url: "https://example.com/story?a=1&b=2",
    source: "GitHub",
    summary: "一条 重点 摘要。",
    tags: ["AI", "产品"],
    score: 9.4,
  });
  assert.equal(result.items[1]?.url, null);
});

test("uses content identity instead of positional report ids", () => {
  const first = parseHotsearchHtml(html, "https://fh-bio.cn/news/202607302010");
  const next = parseHotsearchHtml(html.replace('data-id="deep-0"', 'data-id="deep-9"'), "https://fh-bio.cn/news/202607302030");
  assert.equal(first.items[0]?.itemKey, next.items[0]?.itemKey);
});

test("rejects pages without recognizable news items", () => {
  assert.throws(() => parseHotsearchHtml("<html><h1>公司主页</h1></html>", "https://fh-bio.cn/news/"));
});

test("derives the provider from deployment config without a tenant hardcode", () => {
  assert.equal(
    resolveNewsProviderUrl({ WORKSPACE_PUBLIC_ORIGIN: "https://tenant.example/test" }),
    "https://tenant.example/news/",
  );
  assert.equal(resolveNewsProviderUrl({ NEWS_PROVIDER_URL: "http://169.254.169.254/news" }), null);
});

test("follows same-origin redirects and rejects cross-origin redirects", async () => {
  const sameOrigin = new HotsearchHtmlAdapter("https://example.com/news/", async (url) => {
    if (url.pathname === "/news/") {
      return new Response(null, { status: 302, headers: { location: "/news/report-1" } });
    }
    return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  });
  const briefing = await sameOrigin.getLatestBriefing();
  assert.equal(briefing.sourceUrl, "https://example.com/news/report-1");
  assert.equal(briefing.items.length, 2);

  const crossOrigin = new HotsearchHtmlAdapter("https://example.com/news/", async () => (
    new Response(null, { status: 302, headers: { location: "https://other.example/news/report-1" } })
  ));
  await assert.rejects(() => crossOrigin.getLatestBriefing(), /跨源重定向/);
});

test("rejects non-HTML and oversized provider responses", async () => {
  const nonHtml = new HotsearchHtmlAdapter("https://example.com/news/", async () => (
    new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
  ));
  await assert.rejects(() => nonHtml.getLatestBriefing(), /非 HTML/);

  const oversized = new HotsearchHtmlAdapter("https://example.com/news/", async () => (
    new Response(html, {
      status: 200,
      headers: { "content-type": "text/html", "content-length": "1000001" },
    })
  ));
  await assert.rejects(() => oversized.getLatestBriefing(), /大小限制/);
});
