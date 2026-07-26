import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";
import { WorkspaceAnalysisRuntimeError, type WorkspaceAnalysisSourceLoadRequest } from "@workspace/platform/server/workspace-analysis-runtime";

import { ADMINISTRATION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-sources";

mock.module("server-only", { namedExports: {} } as never);
let allowed = true;
const queries: unknown[] = [];
mock.module("./workspace-analysis-source-access", { namedExports: {
  buildAdministrationWorkspaceAnalysisSourceCatalog: () => createWorkspaceAnalysisSourceCatalog(ADMINISTRATION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS),
  canDiscoverAdministrationWorkspaceAnalysisSource: async () => allowed,
} } as never);
mock.module("./contracts", { namedExports: {
  listContracts: async (query: unknown) => {
    queries.push(query);
    return { contracts: [{ name: "采购框架", amount: 100, editedBy: 9 }], total: 1 };
  },
} } as never);
mock.module("./erp-diligence", { namedExports: {
  listErpDiligenceWorkspace: async ({ userId }: { userId: number }) => ({
    submission: null,
    submissions: [{
      id: 10,
      respondentUserId: userId,
      respondentName: "张三",
      positionAssignmentId: 20,
      departmentName: "销售部",
      roleTitle: "销售经理",
      primaryArea: "订单到回款",
      status: "submitted",
      answers: { risk: "高", tags: ["跨系统"] },
      processSteps: [{
        key: "quote",
        activityKey: "quotation",
        ownerPositionId: 30,
        ownerPositionName: "销售经理",
        ownerDepartmentName: "销售部",
        frequency: "每日",
        volumeBand: "高",
        touchTimeBand: "30m",
        waitTimeBand: "1d",
        executionMode: "人工",
        inputStructure: "半结构化",
        ruleType: "规则",
        variability: "中",
        exceptionRate: "5%",
        errorRate: "1%",
        handoffMode: "系统",
        systemCount: "3",
        logAvailability: "完整",
        riskLevel: "高",
        reviewRequirement: "双人复核",
        painPoints: ["重复录入"],
        notes: "说明",
      }],
      evidenceItems: [{
        key: "contract",
        documentType: "合同",
        format: "PDF",
        updateFrequency: "按单",
        completeness: "完整",
        sampleLocation: "资料库",
        ownerPositionId: 30,
        ownerPositionName: "销售经理",
        ownerDepartmentName: "销售部",
        notes: "样本",
        attachments: [{
          attachmentUid: "att-1",
          evidenceKey: "contract",
          fileName: "合同.pdf",
          mimeType: "application/pdf",
          fileSize: 1024,
          checksumSha256: "abc",
          uploadedAt: "2026-07-25T00:00:00.000Z",
        }],
      }],
      campaignKey: "order-to-cash-2026",
      definitionVersion: 2,
      submittedAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
      version: 2,
      completionPercent: 100,
    }],
    positionOptions: [],
    responsibilityPositionOptions: [],
    canViewAll: true,
  }),
} } as never);

const { loadAdministrationWorkspaceAnalysisSource } = await import("./workspace-analysis-source-executor");

test("administration owner executes the paginated list and projects canonical fields", async () => {
  allowed = true;
  queries.length = 0;
  const result = await loadAdministrationWorkspaceAnalysisSource(request({
    sourceKey: "administration.contracts",
    fields: ["name", "amount"],
    parameters: { keyword: "采购", category: "框架" },
  }));
  assert.deepEqual(queries, [{ q: "采购", location: undefined, category: "框架", status: undefined, page: 1, pageSize: 100 }]);
  assert.deepEqual(result.rows, [{ name: "采购框架", amount: 100 }]);
  assert.equal(JSON.stringify(result).includes("editedBy"), false);
});

test("administration owner exposes every ERP diligence business row while excluding binary content", async () => {
  allowed = true;
  const cases = [
    ["administration.erp-diligence.submissions", ["id", "respondentName", "completionPercent"]],
    ["administration.erp-diligence.answers", ["submissionId", "path", "textValue"]],
    ["administration.erp-diligence.process-steps", ["submissionId", "key", "riskLevel"]],
    ["administration.erp-diligence.process-step-pain-points", ["submissionId", "processStepKey", "painPoint"]],
    ["administration.erp-diligence.evidence-items", ["submissionId", "key", "sampleLocation"]],
    ["administration.erp-diligence.evidence-attachments", ["submissionId", "fileName", "checksumSha256"]],
  ] as const;

  for (const [sourceKey, fields] of cases) {
    const result = await loadAdministrationWorkspaceAnalysisSource(request({ sourceKey, fields: [...fields] }));
    assert.deepEqual(Object.keys(result.rows[0] ?? {}), [...fields]);
  }
});

test("administration owner rechecks the inherited read permission", async () => {
  allowed = false;
  queries.length = 0;
  await assert.rejects(() => loadAdministrationWorkspaceAnalysisSource(request({
    sourceKey: "administration.contracts",
    fields: ["name"],
  })), (error) => (
    error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_forbidden"
  ));
  assert.equal(queries.length, 0);
});

function request(input: {
  sourceKey: string;
  fields: string[];
  parameters?: Record<string, string | number | boolean>;
}): WorkspaceAnalysisSourceLoadRequest {
  return {
    requesterId: 7, targetType: "personal", targetId: 7, ownerUnitId: "administration",
    sourceKey: input.sourceKey, sourceVersion: 1,
    parameters: input.parameters ?? {}, fields: input.fields,
    limits: { maxRows: 100, maxGroups: 20, pageSize: 100, maxPages: 1, maxBytes: 100_000, timeoutMs: 1_000 },
    signal: new AbortController().signal,
  };
}
