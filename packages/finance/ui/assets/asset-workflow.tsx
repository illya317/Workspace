"use client";

import type { FormSurfaceReadOnlyFieldSpec } from "@workspace/core/ui";
import type { ApprovalRequestViewDto } from "@workspace/platform";
import { getWorkflowStatusLabel, useWorkflowRequestsSection } from "@workspace/platform/ui/workflow";
import type { CreateFinanceAssetCardInput, FinanceAssetCategoryDto } from "../../types/assets";
import { KIND_LABELS } from "./assetScheduleUi";

const FINANCE_ASSET_WORKFLOW_ENDPOINT = "/api/modules/finance/assets/submissions";

type FinanceAssetApprovalPayload = {
  entityType: "asset_card";
  data: CreateFinanceAssetCardInput;
};

type FinanceAssetApprovalRequest = ApprovalRequestViewDto<FinanceAssetApprovalPayload>;

export function useFinanceAssetApprovalSection(input: {
  currentUserId: number;
  categories: FinanceAssetCategoryDto[];
  reloadToken: number;
  onCommitted: () => void | Promise<void>;
  notify: (toast: { message: string; type: "success" | "error" }) => void;
}) {
  const categoryById = new Map(input.categories.map((category) => [category.id, category]));
  return useWorkflowRequestsSection<FinanceAssetApprovalRequest>({
    endpoint: FINANCE_ASSET_WORKFLOW_ENDPOINT,
    reloadToken: input.reloadToken,
    title: "建卡审批",
    emptyText: "暂无建卡审批记录",
    currentUserId: input.currentUserId,
    notify: input.notify,
    onCommitted: input.onCommitted,
    filterRequests: focusRequestedApproval,
    requestFields: (request) => assetApprovalFields(request, categoryById),
  });
}

function focusRequestedApproval(requests: FinanceAssetApprovalRequest[]) {
  if (typeof window === "undefined") return requests;
  const focusId = Number(new URLSearchParams(window.location.search).get("approvalId"));
  if (!Number.isInteger(focusId) || focusId <= 0) return requests;
  return [...requests].sort((left, right) => Number(right.id === focusId) - Number(left.id === focusId));
}

function assetApprovalFields(
  request: FinanceAssetApprovalRequest,
  categoryById: Map<number, FinanceAssetCategoryDto>,
): FormSurfaceReadOnlyFieldSpec[] {
  const data = request.latestPayload.data;
  const category = categoryById.get(data.categoryId);
  return [
    readonlyField("status", "状态", getWorkflowStatusLabel(request.status, request.flowType)),
    readonlyField("submitter", "录入人", request.submitterName || "-"),
    readonlyField("company", "公司", data.companyCode),
    readonlyField("name", "资产名称", data.name),
    readonlyField("kind", "资产类型", KIND_LABELS[data.assetKind]),
    readonlyField("category", "资产分类", category ? `${category.code} · ${category.name}` : String(data.categoryId)),
    readonlyField("cost", "资产原值", Number(data.originalCost).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })),
    readonlyField("acquisitionDate", "取得日期", data.acquisitionDate || "-"),
    readonlyField("depreciationStartDate", "起算日期", data.depreciationStartDate || "-"),
    readonlyField("usefulLife", "使用期限", data.usefulLifeMonths ? `${data.usefulLifeMonths} 个月` : "-"),
    readonlyField("note", "备注", data.note || "-"),
  ];
}

function readonlyField(key: string, label: string, value: string): FormSurfaceReadOnlyFieldSpec {
  return { kind: "readonly", key, label, value };
}
