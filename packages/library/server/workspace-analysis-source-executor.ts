import "server-only";

import { runRegisteredWorkspaceAnalysisSource } from "@workspace/platform/server/workspace-analysis-source-executor";
import type { WorkspaceAnalysisSourceRegistration } from "@workspace/platform/server/workspace-analysis-source-registry";
import {
  WorkspaceAnalysisRuntimeError,
  type WorkspaceAnalysisSourceLoadRequest,
} from "@workspace/platform/server/workspace-analysis-runtime";

import type { DirectoryNode } from "./directories";
import type { DocumentWithVersion, ListFilters } from "./metadata";
import {
  executeLibraryCategoriesCommand,
  executeLibraryDirectoriesCommand,
  executeListLibraryDocumentsCommand,
} from "./route-commands";
import {
  buildLibraryWorkspaceAnalysisSourceCatalog,
  canDiscoverLibraryWorkspaceAnalysisSource,
} from "./workspace-analysis-source-access";
import {
  getDocumentVersionsForDocuments,
  type VersionInfo,
} from "./versions";
import type {
  LibraryDirectoryAnalysisRow,
  LibraryDirectoryChildAnalysisRow,
  LibraryDocumentCurrentVersionAnalysisRow,
  LibraryDocumentTagAnalysisRow,
  LibraryDocumentVersionAnalysisRow,
} from "./workspace-analysis-sources";

type MaterializedRows = {
  readonly rows: readonly object[];
  readonly totalRows: number;
};

const DOCUMENT_PAGE_SIZE = 200;
const MAX_DOCUMENT_INPUT_PAGES = 25;

export function loadLibraryWorkspaceAnalysisSource(request: WorkspaceAnalysisSourceLoadRequest) {
  let materializedRows: Promise<MaterializedRows> | undefined;

  return runRegisteredWorkspaceAnalysisSource({
    ownerUnitId: "library",
    sourceCatalog: buildLibraryWorkspaceAnalysisSourceCatalog(),
    request,
    canExecute: canDiscoverLibraryWorkspaceAnalysisSource,
    loadPage: async ({ registration, requesterId, parameters, page, pageSize, signal }) => {
      if (signal.aborted) throw cancelled(request.sourceKey);
      if (registration.definition.sourceKey === "library.documents") {
        const result = await executeListLibraryDocumentsCommand({
          ...documentFilters(parameters),
          userId: requesterId,
          page,
          pageSize,
        });
        return {
          rows: result.documents.map(normalizeDocumentRow),
          totalRows: result.total,
        };
      }

      materializedRows ??= loadMaterializedRows({
        registration,
        requesterId,
        parameters,
        rowLimit: request.limits.maxRows,
        signal,
      });
      const loaded = await materializedRows;
      if (signal.aborted) throw cancelled(request.sourceKey);
      const start = (page - 1) * pageSize;
      return {
        rows: loaded.rows.slice(start, start + pageSize),
        totalRows: loaded.totalRows,
      };
    },
  });
}

async function loadMaterializedRows(input: {
  readonly registration: WorkspaceAnalysisSourceRegistration;
  readonly requesterId: number;
  readonly parameters: WorkspaceAnalysisSourceLoadRequest["parameters"];
  readonly rowLimit: number;
  readonly signal: AbortSignal;
}): Promise<MaterializedRows> {
  const sourceKey = input.registration.definition.sourceKey;
  switch (sourceKey) {
    case "library.document-versions": {
      const documents = await loadAllVisibleDocuments(input);
      const versionRows = await getDocumentVersionsForDocuments(
        documents.map((document) => document.id),
        input.rowLimit + 1,
      );
      if (versionRows.length > input.rowLimit) {
        throw new WorkspaceAnalysisRuntimeError(
          "source_limit_exceeded",
          `资料历史版本超过 ${input.rowLimit.toLocaleString("en-US")} 行上限，请增加资料筛选条件`,
          sourceKey,
        );
      }
      const documentsById = new Map(documents.map((document) => [document.id, document]));
      const rows = versionRows.map((rawVersion) => {
        const document = documentsById.get(rawVersion.documentId);
        if (!document) {
          throw new WorkspaceAnalysisRuntimeError(
            "source_response_invalid",
            "资料历史版本返回了不可见的资料关系",
            sourceKey,
          );
        }
        const { documentId, ...version } = rawVersion;
        return {
          documentId,
          documentUid: document.documentUid,
          docId: document.docId,
          isCurrent: document.currentVersionId === version.id,
          ...normalizeVersionRow(version),
        } satisfies LibraryDocumentVersionAnalysisRow;
      });
      return { rows, totalRows: rows.length };
    }
    case "library.document-current-versions": {
      const documents = await loadAllVisibleDocuments(input);
      const rows = documents.flatMap((document) => document.versions.map((version) => ({
        documentId: document.id,
        documentUid: document.documentUid,
        docId: document.docId,
        isCurrent: document.currentVersionId === version.id,
        ...normalizeVersionRow(version),
      } satisfies LibraryDocumentCurrentVersionAnalysisRow)));
      return { rows, totalRows: rows.length };
    }
    case "library.document-tags": {
      const documents = await loadAllVisibleDocuments(input);
      const rows = documents.flatMap((document) => document.tags.map((tag) => ({
        documentId: document.id,
        documentUid: document.documentUid,
        docId: document.docId,
        tag,
      } satisfies LibraryDocumentTagAnalysisRow)));
      return { rows, totalRows: rows.length };
    }
    case "library.categories": {
      const rows = await executeLibraryCategoriesCommand({ userId: input.requesterId });
      return { rows, totalRows: rows.length };
    }
    case "library.directories": {
      const roots = await executeLibraryDirectoriesCommand({ userId: input.requesterId });
      const rows = flattenDirectories(roots);
      return { rows, totalRows: rows.length };
    }
    case "library.directory-children": {
      const roots = await executeLibraryDirectoriesCommand({ userId: input.requesterId });
      const rows = flattenDirectoryChildren(roots);
      return { rows, totalRows: rows.length };
    }
    default:
      throw new WorkspaceAnalysisRuntimeError("source_unavailable", "资料库经营分析数据源不存在", sourceKey);
  }
}

async function loadAllVisibleDocuments(input: {
  readonly requesterId: number;
  readonly parameters: WorkspaceAnalysisSourceLoadRequest["parameters"];
  readonly signal: AbortSignal;
  readonly registration: WorkspaceAnalysisSourceRegistration;
}) {
  const documents: DocumentWithVersion[] = [];
  const documentIds = new Set<number>();
  let expectedTotal: number | null = null;
  for (let page = 1; page <= MAX_DOCUMENT_INPUT_PAGES; page += 1) {
    if (input.signal.aborted) throw cancelled(input.registration.definition.sourceKey);
    const result = await executeListLibraryDocumentsCommand({
      ...documentFilters(input.parameters),
      userId: input.requesterId,
      page,
      pageSize: DOCUMENT_PAGE_SIZE,
    });
    if (expectedTotal === null) expectedTotal = result.total;
    else if (result.total !== expectedTotal) {
      throw new WorkspaceAnalysisRuntimeError(
        "source_response_invalid",
        "资料列表分页总数在运行期间发生变化",
        input.registration.definition.sourceKey,
      );
    }
    if (result.total > DOCUMENT_PAGE_SIZE * MAX_DOCUMENT_INPUT_PAGES) {
      throw new WorkspaceAnalysisRuntimeError(
        "source_limit_exceeded",
        "资料元数据超过 5,000 条输入上限，请增加资料筛选条件",
        input.registration.definition.sourceKey,
      );
    }
    if (result.documents.length === 0 && documents.length < result.total) {
      throw new WorkspaceAnalysisRuntimeError(
        "source_response_invalid",
        "资料列表在达到分页总数前提前结束",
        input.registration.definition.sourceKey,
      );
    }
    for (const document of result.documents) {
      if (documentIds.has(document.id)) {
        throw new WorkspaceAnalysisRuntimeError(
          "source_response_invalid",
          "资料列表分页返回了重复资料",
          input.registration.definition.sourceKey,
        );
      }
      documentIds.add(document.id);
    }
    documents.push(...result.documents);
    if (documents.length === result.total) return documents;
    if (documents.length > result.total) {
      throw new WorkspaceAnalysisRuntimeError(
        "source_response_invalid",
        "资料列表返回行数超过分页总数",
        input.registration.definition.sourceKey,
      );
    }
  }
  throw new WorkspaceAnalysisRuntimeError(
    "source_limit_exceeded",
    "资料元数据超过 5,000 条输入上限，请增加资料筛选条件",
    input.registration.definition.sourceKey,
  );
}

function documentFilters(parameters: WorkspaceAnalysisSourceLoadRequest["parameters"]): ListFilters {
  return {
    categoryCode: text(parameters.categoryCode),
    directoryPath: text(parameters.directoryPath),
    status: text(parameters.status),
    origin: text(parameters.origin),
    keyword: text(parameters.keyword),
    docId: text(parameters.docId),
  };
}

function normalizeDocumentRow(document: DocumentWithVersion) {
  return {
    ...document,
    fileMtime: iso(document.fileMtime),
    asOfDate: iso(document.asOfDate),
    reviewedAt: iso(document.reviewedAt),
    editedAt: iso(document.editedAt),
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt),
  };
}

function normalizeVersionRow(version: VersionInfo) {
  return {
    ...version,
    sourceModifiedAt: iso(version.sourceModifiedAt),
    createdAt: iso(version.createdAt),
  };
}

function flattenDirectories(nodes: readonly DirectoryNode[]): LibraryDirectoryAnalysisRow[] {
  const rows: LibraryDirectoryAnalysisRow[] = [];
  const visit = (node: DirectoryNode, parentPath: string | null, depth: number) => {
    rows.push({
      path: node.path,
      name: node.name,
      count: node.count,
      parentPath,
      depth,
      hasChildren: node.children.length > 0,
      children: node.children,
    });
    for (const child of node.children) visit(child, node.path, depth + 1);
  };
  for (const node of nodes) visit(node, null, 1);
  return rows;
}

function flattenDirectoryChildren(nodes: readonly DirectoryNode[]): LibraryDirectoryChildAnalysisRow[] {
  const rows: LibraryDirectoryChildAnalysisRow[] = [];
  const visit = (node: DirectoryNode, depth: number) => {
    for (const child of node.children) {
      rows.push({
        parentPath: node.path,
        parentName: node.name,
        childPath: child.path,
        childName: child.name,
        childCount: child.count,
        depth: depth + 1,
      });
      visit(child, depth + 1);
    }
  };
  for (const node of nodes) visit(node, 1);
  return rows;
}

function text(value: string | number | boolean | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function iso(value: Date | string): string;
function iso(value: Date | string | null | undefined): string | null;
function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function cancelled(sourceKey: string) {
  return new WorkspaceAnalysisRuntimeError("cancelled", "经营分析运行已取消", sourceKey);
}
