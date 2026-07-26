import "server-only";

import {
  defineWorkspaceAnalysisReadModel,
  type WorkspaceAnalysisReadModelField,
  type WorkspaceAnalysisReadModelFieldClassification,
} from "@workspace/platform/server/workspace-analysis-read-model";

import type { DirectoryNode } from "./directories";
import type { CategoryItem, DocumentWithVersion } from "./metadata";
import type { VersionInfo } from "./versions";

export type LibraryDocumentCurrentVersionAnalysisRow = Omit<VersionInfo, "sourceModifiedAt" | "createdAt"> & {
  readonly documentId: number;
  readonly documentUid: string;
  readonly docId: string;
  readonly isCurrent: boolean;
  readonly sourceModifiedAt: string | null;
  readonly createdAt: string;
};

export type LibraryDocumentVersionAnalysisRow = LibraryDocumentCurrentVersionAnalysisRow;

export type LibraryDocumentTagAnalysisRow = {
  readonly documentId: number;
  readonly documentUid: string;
  readonly docId: string;
  readonly tag: string;
};

export type LibraryDirectoryAnalysisRow = Omit<DirectoryNode, "children"> & {
  readonly parentPath: string | null;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly children: DirectoryNode[];
};

export type LibraryDirectoryChildAnalysisRow = {
  readonly parentPath: string;
  readonly parentName: string;
  readonly childPath: string;
  readonly childName: string;
  readonly childCount: number;
  readonly depth: number;
};

const field = (
  valueKind: WorkspaceAnalysisReadModelField["valueKind"],
  label: string,
  description: string,
  options: Partial<Pick<WorkspaceAnalysisReadModelField, "sensitivity" | "exportPolicy" | "capabilities">> = {},
): WorkspaceAnalysisReadModelField => ({
  classification: "field",
  valueKind,
  label,
  description,
  sensitivity: options.sensitivity ?? "internal",
  exportPolicy: options.exportPolicy ?? "allowed",
  ...(options.capabilities ? { capabilities: options.capabilities } : {}),
});

const identifier = (label: string, description: string) => field("integer", label, description, {
  capabilities: { groupable: true, aggregateOperations: ["count", "distinctCount"] },
});
const identity = (label: string, description: string) => field("text", label, description, {
  capabilities: { groupable: true, aggregateOperations: ["count", "distinctCount"] },
});
const confidential = (
  valueKind: WorkspaceAnalysisReadModelField["valueKind"],
  label: string,
  description: string,
) => field(valueKind, label, description, { sensitivity: "confidential" });
const narrative = (label: string, description: string) => field("text", label, description, {
  sensitivity: "confidential",
  capabilities: { groupable: false },
});
const omit = (
  reason: Extract<WorkspaceAnalysisReadModelFieldClassification, { classification: "omit" }>["reason"],
  description: string,
) => ({ classification: "omit", reason, description } as const);
const child = (sourceKey: string, description: string) => (
  { classification: "childSource", sourceKey, description } as const
);

const WORKSPACE_SCOPES = {
  personal: { mode: "workspace", description: "资料库没有个人归属外键；展示当前账号在资料库原业务页面可见的全公司资料。" },
  department: { mode: "workspace", description: "资料库没有可信目标部门外键；展示当前账号在资料库原业务页面可见的全公司资料。" },
  project: { mode: "workspace", description: "资料库没有项目归属外键；展示当前账号在资料库原业务页面可见的全公司资料。" },
} as const;

const DOCUMENT_PARAMETERS = [
  { key: "categoryCode", queryKey: "categoryCode", label: "分类编码", description: "按资料分类编码筛选。", kind: "text" },
  { key: "directoryPath", queryKey: "directoryPath", label: "文件夹", description: "按逻辑文件夹及其子文件夹筛选。", kind: "text" },
  { key: "status", queryKey: "status", label: "资料状态", description: "按资料生命周期状态筛选。", kind: "text" },
  { key: "origin", queryKey: "origin", label: "资料来源", description: "按 scanned、uploaded、generated 或 manual 筛选。", kind: "text" },
  { key: "keyword", queryKey: "keyword", label: "关键词", description: "按标题、文件名、简介、分类、资料编号或标签筛选。", kind: "text" },
  { key: "docId", queryKey: "docId", label: "资料编号", description: "按资料业务编号筛选。", kind: "text" },
] as const;

const STANDARD_LIMITS = {
  maxRows: 5_000,
  maxGroups: 500,
  maxPageSize: 200,
  maxPages: 25,
  maxBytes: 8 * 1024 * 1024,
  timeoutMs: 10_000,
} as const;

export const LIBRARY_DOCUMENTS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<DocumentWithVersion>()({
  sourceKey: "library.documents",
  version: 1,
  label: "资料元数据",
  description: "以一份资料为粒度，复用资料列表的 read 权限、密级过滤与分页；不读取文件正文或二进制。",
  apiPath: "/api/modules/library/basic-info/documents",
  rowsPath: "documents",
  totalPath: "total",
  scopes: WORKSPACE_SCOPES,
  parameters: DOCUMENT_PARAMETERS,
  fields: {
    id: identifier("资料 ID", "资料数据库关系标识，用于连接子读模型。"),
    documentUid: identity("资料 UID", "资料不可变 UUID。"),
    docId: identity("资料编号", "资料业务编号。"),
    stableKey: field("text", "稳定来源键", "资料列表公开的稳定来源定位键。", { sensitivity: "confidential", exportPolicy: "forbidden" }),
    rootKey: field("text", "来源根键", "资料列表公开的多根存储键。", { sensitivity: "confidential", exportPolicy: "forbidden" }),
    relativePath: field("text", "来源相对路径", "资料列表公开的来源或入库相对路径。", { sensitivity: "restricted", exportPolicy: "forbidden" }),
    fileName: confidential("text", "文件名", "资料当前展示文件名。"),
    extension: field("text", "扩展名", "资料当前文件扩展名。"),
    mimeType: field("text", "MIME 类型", "资料当前 MIME 类型。"),
    fileSizeBytes: field("integer", "文件大小", "资料当前文件大小，单位为字节。"),
    fileMtime: field("date", "源文件修改时间", "资料当前文件记录的源修改时间。"),
    checksumSha256: field("text", "SHA-256", "资料文件完整性校验指纹。", { sensitivity: "confidential", exportPolicy: "forbidden" }),
    categoryCode: field("text", "分类编码", "资料分类编码。"),
    categoryName: field("text", "分类名称", "资料分类名称。"),
    subcategoryPath: field("text", "子分类路径", "资料子分类路径。"),
    directoryPath: confidential("text", "逻辑文件夹", "资料当前逻辑文件夹路径。"),
    title: confidential("text", "资料标题", "资料标题。"),
    summary: narrative("资料简介", "资料简介或摘要。"),
    categoryId: identifier("分类 ID", "资料正式业务分类标识。"),
    currentDirectoryId: identifier("文件夹 ID", "资料当前逻辑文件夹标识。"),
    categorySource: field("text", "分类来源", "资料分类的 folder、manual 或 rule 来源。"),
    currentVersionId: identifier("当前版本 ID", "资料当前有效版本标识，用于连接当前版本子读模型。"),
    confidentialityLevel: field("integer", "保密等级", "原业务服务完成可见性过滤后的资料保密等级。"),
    status: field("text", "资料状态", "资料 active、missing、archived 或 draft 状态。"),
    origin: field("text", "资料来源", "资料 scanned、uploaded、generated 或 manual 来源。"),
    generatorKey: field("text", "生成器", "生成资料的来源生成器标识。"),
    versionLabel: field("text", "当前版本标签", "资料当前版本展示标签。"),
    ownerUserId: identifier("资料负责人 ID", "资料维护负责人用户标识。"),
    asOfDate: field("date", "资料截止日", "资料内容对应的业务截止日期。"),
    reviewStatus: field("text", "复核状态", "资料复核状态。"),
    reviewedAt: field("date", "复核时间", "资料最后复核时间。"),
    reviewedBy: identifier("复核人 ID", "资料最后复核用户标识。"),
    gitRepo: field("text", "Git 仓库", "生成资料公开 DTO 返回的 Git 仓库定位。", { sensitivity: "restricted", exportPolicy: "forbidden" }),
    gitCommit: field("text", "Git 提交", "生成资料公开 DTO 返回的 Git 提交标识。", { sensitivity: "restricted", exportPolicy: "forbidden" }),
    gitPath: field("text", "Git 路径", "生成资料公开 DTO 返回的 Git 文件路径。", { sensitivity: "restricted", exportPolicy: "forbidden" }),
    editedBy: identifier("最后编辑人 ID", "资料元数据最后编辑用户标识。"),
    editedAt: field("date", "最后编辑时间", "资料元数据最后编辑时间。"),
    version: field("integer", "资料版本", "资料元数据版本号。"),
    createdAt: field("date", "创建时间", "资料记录创建时间。"),
    updatedAt: field("date", "更新时间", "资料记录最后更新时间。"),
    versions: child("library.document-current-versions", "资料列表公开的当前版本元数据拆为可执行子读模型。"),
    tags: child("library.document-tags", "资料正式标签拆为可执行一对多子读模型。"),
    processing: omit("notPublic", "资料列表不返回处理运行态；单条详情与处理任务不登记为经营分析数据源。"),
  },
  pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 200, maxPages: 25 },
  limits: STANDARD_LIMITS,
});

export const LIBRARY_DOCUMENT_CURRENT_VERSIONS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<LibraryDocumentCurrentVersionAnalysisRow>()({
  sourceKey: "library.document-current-versions",
  version: 1,
  label: "资料当前版本",
  description: "以资料列表返回的当前版本为粒度；每份资料最多一条，不读取历史版本详情或文件内容。",
  apiPath: "/api/modules/library/basic-info/documents",
  rowsPath: "currentVersions",
  totalPath: "total",
  scopes: WORKSPACE_SCOPES,
  parameters: DOCUMENT_PARAMETERS,
  fields: {
    documentId: identifier("资料 ID", "所属资料关系标识。"),
    documentUid: identity("资料 UID", "所属资料不可变 UUID。"),
    docId: identity("资料编号", "所属资料业务编号。"),
    isCurrent: field("boolean", "当前版本", "版本是否等于资料当前有效版本。"),
    id: identifier("版本 ID", "资料版本关系标识。"),
    versionUid: identity("版本 UID", "资料版本不可变 UUID。"),
    versionNo: field("integer", "版本序号", "资料内递增版本序号。"),
    versionLabel: field("text", "版本标签", "版本展示标签。"),
    fileName: confidential("text", "版本文件名", "版本文件名。"),
    relativePath: field("text", "版本相对路径", "资料列表公开的版本入库相对路径。", { sensitivity: "restricted", exportPolicy: "forbidden" }),
    extension: field("text", "扩展名", "版本文件扩展名。"),
    mimeType: field("text", "MIME 类型", "版本文件 MIME 类型。"),
    fileSizeBytes: field("integer", "文件大小", "版本文件大小，单位为字节。"),
    sourceModifiedAt: field("date", "源文件修改时间", "版本记录的源文件修改时间。"),
    checksumSha256: field("text", "版本 SHA-256", "版本文件完整性校验指纹。", { sensitivity: "confidential", exportPolicy: "forbidden" }),
    gitCommit: field("text", "版本 Git 提交", "资料列表公开的版本 Git 提交标识。", { sensitivity: "restricted", exportPolicy: "forbidden" }),
    changeNote: narrative("变更说明", "版本变更说明。"),
    createdBy: identifier("入库人 ID", "创建该版本的用户标识。"),
    createdAt: field("date", "入库时间", "版本记录创建时间。"),
  },
  pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 200, maxPages: 25 },
  limits: STANDARD_LIMITS,
});

export const LIBRARY_DOCUMENT_VERSIONS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<LibraryDocumentVersionAnalysisRow>()({
  sourceKey: "library.document-versions",
  version: 1,
  label: "资料历史版本",
  description: "以当前账号在资料列表中可见的资料为父集，有界展开全部不可变历史版本；沿用原 read 权限和密级过滤，不读取存储定位、文件正文或二进制。",
  apiPath: "/api/modules/library/basic-info/documents",
  rowsPath: "documentVersions",
  totalPath: "total",
  scopes: WORKSPACE_SCOPES,
  parameters: DOCUMENT_PARAMETERS,
  fields: {
    documentId: identifier("资料 ID", "所属资料关系标识。"),
    documentUid: identity("资料 UID", "所属资料不可变 UUID。"),
    docId: identity("资料编号", "所属资料业务编号。"),
    isCurrent: field("boolean", "当前版本", "版本是否等于资料当前有效版本。"),
    id: identifier("版本 ID", "资料版本关系标识。"),
    versionUid: identity("版本 UID", "资料版本不可变 UUID。"),
    versionNo: field("integer", "版本序号", "资料内递增版本序号。"),
    versionLabel: field("text", "版本标签", "版本展示标签。"),
    fileName: confidential("text", "版本文件名", "版本文件名。"),
    relativePath: field("text", "版本相对路径", "版本公开 DTO 返回的入库路径快照。", { sensitivity: "restricted", exportPolicy: "forbidden" }),
    extension: field("text", "扩展名", "版本文件扩展名。"),
    mimeType: field("text", "MIME 类型", "版本文件 MIME 类型。"),
    fileSizeBytes: field("integer", "文件大小", "版本文件大小，单位为字节。"),
    sourceModifiedAt: field("date", "源文件修改时间", "版本记录的源文件修改时间。"),
    checksumSha256: field("text", "版本 SHA-256", "版本文件完整性校验指纹。", { sensitivity: "confidential", exportPolicy: "forbidden" }),
    gitCommit: field("text", "版本 Git 提交", "版本公开 DTO 返回的 Git 提交标识。", { sensitivity: "restricted", exportPolicy: "forbidden" }),
    changeNote: narrative("变更说明", "版本变更说明。"),
    createdBy: identifier("入库人 ID", "创建该版本的用户标识。"),
    createdAt: field("date", "入库时间", "版本记录创建时间。"),
  },
  pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 200, maxPages: 25 },
  limits: STANDARD_LIMITS,
});

export const LIBRARY_DOCUMENT_TAGS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<LibraryDocumentTagAnalysisRow>()({
  sourceKey: "library.document-tags",
  version: 1,
  label: "资料标签",
  description: "以一份资料的一个正式标签为粒度，只展开资料列表已经返回的标签。",
  apiPath: "/api/modules/library/basic-info/documents",
  rowsPath: "tags",
  totalPath: "total",
  scopes: WORKSPACE_SCOPES,
  parameters: DOCUMENT_PARAMETERS,
  fields: {
    documentId: identifier("资料 ID", "所属资料关系标识。"),
    documentUid: identity("资料 UID", "所属资料不可变 UUID。"),
    docId: identity("资料编号", "所属资料业务编号。"),
    tag: confidential("text", "标签", "资料已确认的正式标签名称。"),
  },
  pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 200, maxPages: 50 },
  limits: { ...STANDARD_LIMITS, maxRows: 10_000, maxPages: 50 },
});

export const LIBRARY_CATEGORIES_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<CategoryItem>()({
  sourceKey: "library.categories",
  version: 1,
  label: "资料分类汇总",
  description: "以一个资料分类编码为粒度，复用分类接口的密级过滤并返回可见资料数量。",
  apiPath: "/api/modules/library/basic-info/categories",
  rowsPath: "categories",
  totalPath: "total",
  scopes: WORKSPACE_SCOPES,
  fields: {
    code: identity("分类编码", "资料分类编码。"),
    name: field("text", "分类名称", "资料分类名称。"),
    count: field("integer", "资料数量", "当前账号可见的该分类资料数量。"),
  },
  pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 200, maxPages: 3 },
  limits: { ...STANDARD_LIMITS, maxRows: 500, maxPages: 3 },
});

export const LIBRARY_DIRECTORIES_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<LibraryDirectoryAnalysisRow>()({
  sourceKey: "library.directories",
  version: 1,
  label: "资料逻辑文件夹",
  description: "以一个可见逻辑文件夹为粒度，将目录树规范化为扁平行；计数沿用原目录接口。",
  apiPath: "/api/modules/library/basic-info/directories",
  rowsPath: "directories",
  totalPath: "total",
  scopes: WORKSPACE_SCOPES,
  fields: {
    path: confidential("text", "文件夹路径", "逻辑文件夹完整路径。"),
    name: confidential("text", "文件夹名称", "逻辑文件夹名称。"),
    count: field("integer", "资料数量", "该文件夹及其下级中当前账号可见的资料数量。"),
    parentPath: confidential("text", "父文件夹路径", "父逻辑文件夹路径；顶层为空。"),
    depth: field("integer", "目录层级", "逻辑文件夹层级，顶层为 1。"),
    hasChildren: field("boolean", "包含子文件夹", "该文件夹是否包含可见子文件夹。"),
    children: child("library.directory-children", "目录树父子关系拆为可执行子读模型。"),
  },
  pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 200, maxPages: 25 },
  limits: STANDARD_LIMITS,
});

export const LIBRARY_DIRECTORY_CHILDREN_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<LibraryDirectoryChildAnalysisRow>()({
  sourceKey: "library.directory-children",
  version: 1,
  label: "资料文件夹父子关系",
  description: "以一条可见文件夹父子关系为粒度，由目录接口返回的 children 安全展开。",
  apiPath: "/api/modules/library/basic-info/directories",
  rowsPath: "directoryChildren",
  totalPath: "total",
  scopes: WORKSPACE_SCOPES,
  fields: {
    parentPath: confidential("text", "父文件夹路径", "父逻辑文件夹完整路径。"),
    parentName: confidential("text", "父文件夹", "父逻辑文件夹名称。"),
    childPath: confidential("text", "子文件夹路径", "子逻辑文件夹完整路径。"),
    childName: confidential("text", "子文件夹", "子逻辑文件夹名称。"),
    childCount: field("integer", "子树资料数量", "子文件夹及其下级中当前账号可见的资料数量。"),
    depth: field("integer", "子目录层级", "子文件夹层级。"),
  },
  pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 200, maxPages: 25 },
  limits: STANDARD_LIMITS,
});

export const LIBRARY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS = [
  LIBRARY_DOCUMENTS_ANALYSIS_SOURCE,
  LIBRARY_DOCUMENT_CURRENT_VERSIONS_ANALYSIS_SOURCE,
  LIBRARY_DOCUMENT_VERSIONS_ANALYSIS_SOURCE,
  LIBRARY_DOCUMENT_TAGS_ANALYSIS_SOURCE,
  LIBRARY_CATEGORIES_ANALYSIS_SOURCE,
  LIBRARY_DIRECTORIES_ANALYSIS_SOURCE,
  LIBRARY_DIRECTORY_CHILDREN_ANALYSIS_SOURCE,
] as const;
