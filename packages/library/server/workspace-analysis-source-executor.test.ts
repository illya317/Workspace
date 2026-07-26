import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";
import {
  WorkspaceAnalysisRuntimeError,
  type WorkspaceAnalysisSourceLoadRequest,
} from "@workspace/platform/server/workspace-analysis-runtime";

import { LIBRARY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-sources";

mock.module("server-only", { namedExports: {} } as never);

let readAllowed = true;
const calls: Array<{ source: string; input: Record<string, unknown> }> = [];
const versionCalls: Array<{ documentIds: readonly number[]; take: number }> = [];
mock.module("./workspace-analysis-source-access", {
  namedExports: {
    buildLibraryWorkspaceAnalysisSourceCatalog: () => createWorkspaceAnalysisSourceCatalog(LIBRARY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS),
    canDiscoverLibraryWorkspaceAnalysisSource: async () => readAllowed,
  },
} as never);
mock.module("./versions", {
  namedExports: {
    getDocumentVersionsForDocuments: async (documentIds: readonly number[], take: number) => {
      versionCalls.push({ documentIds, take });
      return [{
        documentId: 7,
        id: 70,
        versionUid: "version-uid",
        versionNo: 2,
        versionLabel: "V2",
        fileName: "预算说明.docx",
        relativePath: "internal/source.docx",
        extension: "docx",
        mimeType: "application/docx",
        fileSizeBytes: 512,
        sourceModifiedAt: new Date("2026-07-01T01:00:00.000Z"),
        checksumSha256: "hidden-version-checksum",
        gitCommit: "hidden-version-commit",
        changeNote: "修订预算",
        createdBy: 17,
        createdAt: new Date("2026-07-01T02:00:00.000Z"),
      }, {
        documentId: 7,
        id: 69,
        versionUid: "older-version-uid",
        versionNo: 1,
        versionLabel: "V1",
        fileName: "预算说明.docx",
        relativePath: "internal/source.docx",
        extension: "docx",
        mimeType: "application/docx",
        fileSizeBytes: 480,
        sourceModifiedAt: new Date("2026-06-01T01:00:00.000Z"),
        checksumSha256: "older-hidden-version-checksum",
        gitCommit: null,
        changeNote: "首次入库",
        createdBy: 17,
        createdAt: new Date("2026-06-01T02:00:00.000Z"),
      }].slice(0, take);
    },
  },
} as never);
mock.module("./route-commands", {
  namedExports: {
    executeListLibraryDocumentsCommand: async (input: Record<string, unknown>) => {
      calls.push({ source: "documents", input });
      return {
        documents: [{
          id: 7,
          documentUid: "document-uid",
          docId: "LIB-2026-001",
          stableKey: "internal:key",
          rootKey: "default",
          relativePath: "internal/source.docx",
          fileName: "预算说明.docx",
          extension: "docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          fileSizeBytes: 512,
          fileMtime: new Date("2026-07-01T01:00:00.000Z"),
          checksumSha256: "hidden-checksum",
          categoryCode: "03",
          categoryName: "财务",
          subcategoryPath: null,
          directoryPath: "03 财务/预算",
          title: "预算说明",
          summary: "预算资料摘要",
          categoryId: 3,
          currentDirectoryId: 4,
          categorySource: "manual",
          currentVersionId: 70,
          confidentialityLevel: 2,
          status: "active",
          origin: "uploaded",
          generatorKey: null,
          versionLabel: "V2",
          ownerUserId: 17,
          asOfDate: new Date("2026-06-30T00:00:00.000Z"),
          reviewStatus: "approved",
          reviewedAt: new Date("2026-07-02T00:00:00.000Z"),
          reviewedBy: 18,
          gitRepo: "hidden-repo",
          gitCommit: "hidden-commit",
          gitPath: "hidden-path",
          editedBy: 17,
          editedAt: new Date("2026-07-03T00:00:00.000Z"),
          version: 2,
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
          updatedAt: new Date("2026-07-03T00:00:00.000Z"),
          versions: [{
            id: 70,
            versionUid: "version-uid",
            versionNo: 2,
            versionLabel: "V2",
            fileName: "预算说明.docx",
            relativePath: "internal/source.docx",
            extension: "docx",
            mimeType: "application/docx",
            fileSizeBytes: 512,
            sourceModifiedAt: new Date("2026-07-01T01:00:00.000Z"),
            checksumSha256: "hidden-version-checksum",
            gitCommit: "hidden-version-commit",
            changeNote: "修订预算",
            createdBy: 17,
            createdAt: new Date("2026-07-01T02:00:00.000Z"),
          }],
          tags: ["预算", "经营"],
        }],
        total: 1,
      };
    },
    executeLibraryCategoriesCommand: async (input: Record<string, unknown>) => {
      calls.push({ source: "categories", input });
      return [{ code: "03", name: "财务", count: 1 }];
    },
    executeLibraryDirectoriesCommand: async (input: Record<string, unknown>) => {
      calls.push({ source: "directories", input });
      return [{
        path: "03 财务",
        name: "03 财务",
        count: 1,
        children: [{ path: "03 财务/预算", name: "预算", count: 1, children: [] }],
      }];
    },
  },
} as never);

const { loadLibraryWorkspaceAnalysisSource } = await import("./workspace-analysis-source-executor");

test("Library document executor reuses the list command, original filters and canonical JSON scalars", async () => {
  calls.length = 0;
  const result = await loadLibraryWorkspaceAnalysisSource(request({
    sourceKey: "library.documents",
    parameters: { categoryCode: "03", keyword: "预算" },
    fields: ["id", "title", "confidentialityLevel", "fileMtime", "updatedAt"],
  }));

  assert.deepEqual(result.rows, [{
    id: 7,
    title: "预算说明",
    confidentialityLevel: 2,
    fileMtime: "2026-07-01T01:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z",
  }]);
  assert.deepEqual(calls, [{
    source: "documents",
    input: {
      categoryCode: "03",
      directoryPath: undefined,
      status: undefined,
      origin: undefined,
      keyword: "预算",
      docId: undefined,
      userId: 17,
      page: 1,
      pageSize: 50,
    },
  }]);
  assert.equal(JSON.stringify(result).includes("internal:key"), false);
});

test("Library child sources expand only list DTO versions and tags", async () => {
  calls.length = 0;
  const versions = await loadLibraryWorkspaceAnalysisSource(request({
    sourceKey: "library.document-current-versions",
    fields: ["documentId", "versionUid", "isCurrent", "createdAt"],
  }));
  const tags = await loadLibraryWorkspaceAnalysisSource(request({
    sourceKey: "library.document-tags",
    fields: ["documentId", "tag"],
    maxRows: 10_000,
    maxPages: 50,
  }));

  assert.deepEqual(versions.rows, [{
    documentId: 7,
    versionUid: "version-uid",
    isCurrent: true,
    createdAt: "2026-07-01T02:00:00.000Z",
  }]);
  assert.deepEqual(tags.rows, [
    { documentId: 7, tag: "预算" },
    { documentId: 7, tag: "经营" },
  ]);
  assert.equal(calls.filter((call) => call.source === "documents").length, 2);
  assert.ok(calls.filter((call) => call.source === "documents").every((call) => call.input.pageSize === 200));
});

test("Library historical versions expand the complete bounded history of visible documents", async () => {
  calls.length = 0;
  versionCalls.length = 0;
  const versions = await loadLibraryWorkspaceAnalysisSource(request({
    sourceKey: "library.document-versions",
    parameters: { directoryPath: "03 财务/预算" },
    fields: ["documentId", "documentUid", "versionUid", "versionNo", "isCurrent", "createdAt"],
    maxRows: 10,
  }));

  assert.deepEqual(versions.rows, [{
    documentId: 7,
    documentUid: "document-uid",
    versionUid: "version-uid",
    versionNo: 2,
    isCurrent: true,
    createdAt: "2026-07-01T02:00:00.000Z",
  }, {
    documentId: 7,
    documentUid: "document-uid",
    versionUid: "older-version-uid",
    versionNo: 1,
    isCurrent: false,
    createdAt: "2026-06-01T02:00:00.000Z",
  }]);
  assert.deepEqual(versionCalls, [{ documentIds: [7], take: 11 }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input.directoryPath, "03 财务/预算");
  assert.equal(calls[0]?.input.pageSize, 200);
});

test("Library historical versions fail closed instead of truncating at the requested row limit", async () => {
  calls.length = 0;
  versionCalls.length = 0;
  await assert.rejects(
    () => loadLibraryWorkspaceAnalysisSource(request({
      sourceKey: "library.document-versions",
      fields: ["versionUid"],
      maxRows: 1,
    })),
    (error) => error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_limit_exceeded",
  );
  assert.deepEqual(versionCalls, [{ documentIds: [7], take: 2 }]);
});

test("Library category and directory sources reuse their route commands and flatten children", async () => {
  calls.length = 0;
  const categories = await loadLibraryWorkspaceAnalysisSource(request({
    sourceKey: "library.categories",
    fields: ["code", "name", "count"],
    maxRows: 500,
    maxPages: 3,
  }));
  const directories = await loadLibraryWorkspaceAnalysisSource(request({
    sourceKey: "library.directories",
    fields: ["path", "parentPath", "depth", "hasChildren", "count"],
  }));
  const children = await loadLibraryWorkspaceAnalysisSource(request({
    sourceKey: "library.directory-children",
    fields: ["parentPath", "childPath", "childCount", "depth"],
  }));

  assert.deepEqual(categories.rows, [{ code: "03", name: "财务", count: 1 }]);
  assert.deepEqual(directories.rows, [
    { path: "03 财务", parentPath: null, depth: 1, hasChildren: true, count: 1 },
    { path: "03 财务/预算", parentPath: "03 财务", depth: 2, hasChildren: false, count: 1 },
  ]);
  assert.deepEqual(children.rows, [{ parentPath: "03 财务", childPath: "03 财务/预算", childCount: 1, depth: 2 }]);
  assert.deepEqual(calls, [
    { source: "categories", input: { userId: 17 } },
    { source: "directories", input: { userId: 17 } },
    { source: "directories", input: { userId: 17 } },
  ]);
});

test("Library executor refuses before invoking a business command when read is denied", async () => {
  calls.length = 0;
  readAllowed = false;
  await assert.rejects(
    () => loadLibraryWorkspaceAnalysisSource(request({ sourceKey: "library.documents", fields: ["id"] })),
    (error) => error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_forbidden",
  );
  assert.deepEqual(calls, []);
  readAllowed = true;
});

function request(input: {
  sourceKey: string;
  fields: readonly string[];
  parameters?: Readonly<Record<string, string | number | boolean>>;
  maxRows?: number;
  maxPages?: number;
}): WorkspaceAnalysisSourceLoadRequest {
  return {
    requesterId: 17,
    targetType: "department",
    targetId: 99,
    ownerUnitId: "library",
    sourceKey: input.sourceKey,
    sourceVersion: 1,
    parameters: input.parameters ?? {},
    fields: input.fields,
    limits: {
      maxRows: input.maxRows ?? 5_000,
      maxGroups: 500,
      pageSize: 50,
      maxPages: input.maxPages ?? 25,
      maxBytes: 8 * 1024 * 1024,
      timeoutMs: 10_000,
    },
    signal: new AbortController().signal,
  };
}
