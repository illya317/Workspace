import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("server-only", { namedExports: {} } as never);

const paperContent = new TextEncoder().encode(`<!-- generated -->
# Agent 手册

## 目录

- API
- 权限

## API 调用

先发现 contract，再调用。

### 创建模板

使用 POST 创建草稿。

## 权限

读操作需要 read。
`);

const metadata = [
  {
    key: "api-guide",
    title: "Agent 手册",
    description: "API 使用指南",
    format: "paper" as const,
    fileName: "api-guide.md",
    fileSizeBytes: paperContent.byteLength,
    updatedAt: "2026-07-30T00:00:00.000Z",
  },
  {
    key: "employee-handbook",
    title: "员工手册",
    description: "公司制度",
    format: "office" as const,
    fileName: "employee-handbook.docx",
    fileSizeBytes: 128,
    updatedAt: "2026-07-29T00:00:00.000Z",
  },
];
const sourceReads: string[] = [];

mock.module("@workspace/platform/server/company-documents", {
  namedExports: {
    listTenantCompanyDocumentMetadata: async () => metadata,
    readTenantCompanyDocumentSource: async (key: string) => {
      sourceReads.push(key);
      const document = metadata.find((item) => item.key === key);
      if (!document) throw new Error("Company document not found");
      return {
        ...document,
        content: document.format === "paper" ? paperContent : new Uint8Array([1, 2, 3]),
      };
    },
  },
} as never);

const {
  listCompanyDocumentCatalog,
  listCompanyDocuments,
  queryCompanyPaperDocument,
} = await import("./company-documents");

test("company document catalog uses metadata only and page content reads only paper documents", async () => {
  sourceReads.length = 0;
  const catalog = await listCompanyDocumentCatalog();
  assert.equal(catalog.documents[0]?.uiPath, "/docs/company");
  assert.equal(catalog.documents[0]?.structuredPath, "/api/modules/docs/company/documents/api-guide");
  assert.equal(catalog.documents[1]?.structuredPath, null);
  assert.deepEqual(sourceReads, []);

  const documents = await listCompanyDocuments();
  assert.match(documents[0]?.markdown ?? "", /Agent 手册/);
  assert.equal(documents[1]?.markdown, null);
  assert.deepEqual(sourceReads, ["api-guide"]);
});

test("company document interface exposes compact hierarchical sections and bounded search results", async () => {
  const catalogResult = await queryCompanyPaperDocument("api-guide", { offset: 0, limit: 20 });
  assert.equal(catalogResult.status, 200);
  const catalogBody = catalogResult.body as { sections: Array<Record<string, unknown>> };
  assert.deepEqual(catalogBody.sections.map((section) => ({
    key: section.key,
    parentKey: section.parentKey,
  })), [
    { key: "目录", parentKey: null },
    { key: "api-调用", parentKey: null },
    { key: "创建模板", parentKey: "api-调用" },
    { key: "权限", parentKey: null },
  ]);
  assert.equal("content" in catalogBody.sections[0]!, false);

  const searchResult = await queryCompanyPaperDocument("api-guide", { q: "POST", offset: 0, limit: 10 });
  assert.equal(searchResult.status, 200);
  const searchBody = searchResult.body as { results: { total: number; items: Array<Record<string, unknown>> } };
  assert.equal(searchBody.results.total, 1);
  assert.equal(searchBody.results.items[0]?.key, "创建模板");
  assert.match(String(searchBody.results.items[0]?.summary), /POST/);
  assert.equal("content" in searchBody.results.items[0]!, false);
});

test("company document interface keeps source failures fail closed", async () => {
  const missing = await queryCompanyPaperDocument("missing", { offset: 0, limit: 20 });
  assert.deepEqual(missing, { status: 404, body: { error: "Company document not found" } });

  const office = await queryCompanyPaperDocument("employee-handbook", { offset: 0, limit: 20 });
  assert.deepEqual(office, {
    status: 400,
    body: { error: "Structured lookup is available only for paper documents" },
  });
});
