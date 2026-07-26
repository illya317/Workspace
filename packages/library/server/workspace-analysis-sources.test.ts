import assert from "node:assert/strict";
import test from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";

import { LIBRARY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-sources";

test("registers Library list read models with inherited library.basicInfo read", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(LIBRARY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);
  assert.deepEqual(catalog.list().map((source) => source.sourceKey), [
    "library.categories",
    "library.directories",
    "library.directory-children",
    "library.document-current-versions",
    "library.document-tags",
    "library.document-versions",
    "library.documents",
  ]);

  for (const source of catalog.list()) {
    assert.equal(source.ownerModuleKey, "library");
    assert.equal(source.authorization.resourceKey, "library.basicInfo");
    assert.deepEqual(source.authorization.requiredActions, ["read"]);
    assert.equal(source.authorization.enforcement, "gateway");
    assert.deepEqual(Object.values(source.scopeBindings).map((scope) => scope?.mode), [
      "workspace",
      "workspace",
      "workspace",
    ]);
  }
});

test("keeps every public stable document scalar readable while separating child collections", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(LIBRARY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);
  const documents = catalog.resolve("library.documents", 1)!;

  for (const fieldKey of [
    "id",
    "documentUid",
    "docId",
    "stableKey",
    "rootKey",
    "relativePath",
    "fileName",
    "fileSizeBytes",
    "fileMtime",
    "checksumSha256",
    "categoryCode",
    "directoryPath",
    "title",
    "summary",
    "currentVersionId",
    "confidentialityLevel",
    "ownerUserId",
    "reviewStatus",
    "reviewedAt",
    "gitRepo",
    "gitCommit",
    "gitPath",
    "version",
    "createdAt",
    "updatedAt",
  ]) {
    assert.equal(coverage(documents, fieldKey)?.disposition, "analytical", `${fieldKey} should be readable`);
  }
  assert.equal(coverage(documents, "processing")?.disposition, "omit");
  assert.deepEqual(coverage(documents, "versions"), {
    fieldKey: "versions",
    disposition: "childSource",
    sourceKey: "library.document-current-versions",
    description: "资料列表公开的当前版本元数据拆为可执行子读模型。",
  });
  assert.equal(coverage(documents, "tags")?.disposition, "childSource");
  assert.ok(catalog.resolve("library.document-current-versions", 1));
  assert.ok(catalog.resolve("library.document-tags", 1));
});

test("registers complete public historical version scalars without storage or binary fields", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(LIBRARY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);
  const versions = catalog.resolve("library.document-versions", 1)!;

  for (const fieldKey of [
    "documentId",
    "documentUid",
    "docId",
    "isCurrent",
    "id",
    "versionUid",
    "versionNo",
    "versionLabel",
    "fileName",
    "relativePath",
    "extension",
    "mimeType",
    "fileSizeBytes",
    "sourceModifiedAt",
    "checksumSha256",
    "gitCommit",
    "changeNote",
    "createdBy",
    "createdAt",
  ]) {
    assert.equal(coverage(versions, fieldKey)?.disposition, "analytical", `${fieldKey} should be readable`);
  }
  assert.equal(versions.definition.fields.length, 19);
  for (const privateField of [
    "storagePath",
    "storageFileName",
    "storageMimeType",
    "storageFileSizeBytes",
    "storageChecksumSha256",
    "content",
  ]) {
    assert.equal(versions.definition.fields.some((field) => field.key === privateField), false);
  }
});

test("normalizes directory children to an executable source and never registers file transports or detail routes", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(LIBRARY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);
  const directories = catalog.resolve("library.directories", 1)!;
  assert.deepEqual(coverage(directories, "children"), {
    fieldKey: "children",
    disposition: "childSource",
    sourceKey: "library.directory-children",
    description: "目录树父子关系拆为可执行子读模型。",
  });
  assert.ok(catalog.resolve("library.directory-children", 1));
  for (const registration of LIBRARY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS) {
    assert.doesNotMatch(registration.adapter.path, /download|preview|office-viewer|search|\/:id|\[id\]/);
  }
});

function coverage(
  registration: { readonly fieldCoverage?: readonly { readonly fieldKey: string; readonly disposition: string; readonly [key: string]: unknown }[] },
  fieldKey: string,
) {
  return registration.fieldCoverage?.find((item) => item.fieldKey === fieldKey);
}
