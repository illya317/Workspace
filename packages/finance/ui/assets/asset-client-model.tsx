import { workspacePath } from "@workspace/core/routing";
import { createMessageSection, createPageTableSection, createStatusSection, type BodySurfaceSectionSpec, type SelectorSurfaceProps } from "@workspace/core/ui";
import type { CreateFinanceAssetCardInput, FinanceAssetCardDto, FinanceAssetCategoryDto, FinanceAssetWorkspaceDto } from "../../types/assets";
import { assetAdjustmentColumns, assetPeriodColumns, formatFinanceAmount, KIND_LABELS } from "./assetScheduleUi";
import type { AssetPolicyScope, AssetWorkspaceView } from "./asset-location";
import { financeUiResponseMatchesScope, type FinanceUiRequestScope } from "../components/latest-request-gate";

export function applyAssetCategorySelection<T extends CreateFinanceAssetCardInput>(current: T, key: keyof CreateFinanceAssetCardInput, value: unknown, categories: FinanceAssetCategoryDto[]): T {
  if (key === "assetKind") return { ...current, assetKind: String(value) as CreateFinanceAssetCardInput["assetKind"], categoryId: 0, assetCode: "", usefulLifeMonths: null, residualRatePercent: String(value) === "fixed_asset" ? 3 : 0 };
  if (key !== "categoryId") return { ...current, [key]: value };
  const categoryId = Number(value) || 0;
  const category = categories.find((item) => item.id === categoryId && item.assetKind === current.assetKind) ?? null;
  if (!category) return { ...current, categoryId, assetCode: "" };
  return { ...current, categoryId, assetCode: "", usefulLifeMonths: category.defaultUsefulLifeMonths, residualRatePercent: category.defaultResidualRatePercent ?? 0, method: category.defaultMethod };
}

export function assetDraftDisplayValues(draft: CreateFinanceAssetCardInput, workspace: FinanceAssetWorkspaceDto | null, original: FinanceAssetCardDto | null) {
  const category = workspace?.categories.find((item) => item.id === draft.categoryId) ?? null;
  const policyPending = category?.policySource === "system_default";
  const unavailable = category?.policyMappingIssue ?? (policyPending ? "待先确认集团核算政策" : null);
  return {
    companyName: workspace?.scope.companyName ?? null,
    categoryName: category?.name ?? (original && draft.categoryId === original.categoryId ? original.categoryName : null),
    assetAccountName: category ? unavailable ?? category.assetAccountName ?? category.assetAccountCode : original && draft.categoryId === original.categoryId ? original.assetAccountName ?? original.assetAccountCode : null,
    accumulatedAccountName: category ? unavailable ?? category.accumulatedAccountName ?? category.accumulatedAccountCode : original && draft.categoryId === original.categoryId ? original.accumulatedAccountName ?? original.accumulatedAccountCode : null,
    reviewRequired: category?.reviewRequired ?? false,
  };
}

export function categoryHasAccountPolicy(draft: CreateFinanceAssetCardInput, workspace: FinanceAssetWorkspaceDto | null) {
  return Boolean(workspace?.categories.some((category) => category.id === draft.categoryId && category.assetKind === draft.assetKind && category.policySource !== "system_default" && !category.policyMappingIssue && category.assetAccountId && ((category.assetKind !== "fixed_asset" && category.assetKind !== "intangible") || category.accumulatedAccountId)));
}

export function buildAssetViewSections({ view, workspace, periodRows, page, pageSize }: { view: Exclude<AssetWorkspaceView, "cards" | "policies">; workspace: FinanceAssetWorkspaceDto | null; periodRows: FinanceAssetWorkspaceDto["periodRows"]; page: number; pageSize: number }): BodySurfaceSectionSpec[] {
  if (!workspace) return [createStatusSection("asset-empty-scope", { kind: "empty", content: "请选择公司、年度和月份" })];
  const pageRows = <T,>(rows: T[]) => rows.slice((page - 1) * pageSize, page * pageSize);
  if (view === "period") return [createMessageSection("asset-period-rule", { tone: "muted", content: "正常折旧/摊销由资产卡片政策计算；发现漏提或错提时，开放期间重新计算并通过总账凭证更正，已关账期间按前期差错政策处理。" }), createPageTableSection("asset-period-rows", { rows: pageRows(periodRows), columns: assetPeriodColumns, visibleColumns: assetPeriodColumns.map((column) => column.key), rowKey: (row) => row.assetId, emptyText: "本期尚未生成折旧摊销", presentation: { density: "compact" }, scroll: { x: true } })];
  if (view === "adjustments") return [createMessageSection("asset-adjustment-history-rule", { tone: "muted", content: "漏提、错提统一通过总账凭证更正；既有独立调整仅保留为历史审计记录。" }), createPageTableSection("asset-adjustments", { rows: pageRows(workspace.adjustments), columns: assetAdjustmentColumns, visibleColumns: assetAdjustmentColumns.map((column) => column.key), rowKey: (row) => row.id, emptyText: "暂无历史调整记录", presentation: { density: "compact" } })];
  return [];
}

export function createAssetCardSelector(input: {
  cards: FinanceAssetCardDto[];
  page: number;
  pageSize: number;
  selectedAssetId: number | null;
  loading: boolean;
  error: string | null;
  workspace: FinanceAssetWorkspaceDto | null;
  onSelect: (card: FinanceAssetCardDto) => void;
}): SelectorSurfaceProps<FinanceAssetCardDto> {
  return {
    kind: "list", title: "资产卡片", selectedId: input.selectedAssetId, loading: input.loading,
    loadingText: "正在加载资产卡片",
    emptyText: input.error ? `加载失败：${input.error}` : input.workspace ? "暂无资产卡片" : "请选择公司、年度和月份",
    items: input.cards.slice((input.page - 1) * input.pageSize, input.page * input.pageSize).map((card) => ({
      key: card.id, value: card, group: KIND_LABELS[card.assetKind],
      card: {
        title: card.name, code: card.assetCode, subtitle: card.categoryName,
        metaLine: `原值 ${formatFinanceAmount(card.originalCost)}`,
        status: { label: card.status === "active" ? "使用中" : card.status, tone: card.status === "active" ? "success" : "muted" },
        tone: "emerald",
      },
    })),
    onSelect: input.onSelect,
  };
}

export function isAssetView(value: unknown): value is AssetWorkspaceView { return value === "cards" || value === "policies" || value === "period" || value === "adjustments"; }
export function firstAssetView(items: Array<{ key: string }>): AssetWorkspaceView { const first = items.find((item) => isAssetView(item.key))?.key; return isAssetView(first) ? first : "cards"; }
export function isAssetPolicyScope(value: unknown): value is AssetPolicyScope { return value === "group" || value === "company"; }
export function firstPolicyScope(items: Array<{ key: string; children?: Array<{ key: string }> }>): AssetPolicyScope { const first = items.find((item) => item.key === "policies")?.children?.find((child) => isAssetPolicyScope(child.key))?.key; return isAssetPolicyScope(first) ? first : "group"; }
export function assetViewShowsCompanyFilter(view: AssetWorkspaceView, policyScope: AssetPolicyScope) { return view !== "policies" || policyScope === "company"; }
export function assetViewLabel(value: AssetWorkspaceView) { return { cards: "资产卡片", policies: "核算政策", period: "本期折旧摊销", adjustments: "减值与处置" }[value]; }
export function periodStateText(workspace: FinanceAssetWorkspaceDto | null) { if (!workspace?.scope.periodId) return "当前期间：未创建"; return workspace.scope.isClosed ? "当前期间：已关账 · 更正需走总账凭证与前期差错流程" : "当前期间：未关账"; }
export async function postJson<T = unknown>(path: string, body: unknown, signal?: AbortSignal) { return sendJson<T>(path, "POST", body, signal); }
export async function putJson<T = unknown>(path: string, body: unknown, signal?: AbortSignal) { return sendJson<T>(path, "PUT", body, signal); }
export async function deleteJson<T = unknown>(path: string, body: unknown, signal?: AbortSignal) { return sendJson<T>(path, "DELETE", body, signal); }
async function sendJson<T>(path: string, method: "DELETE" | "POST" | "PUT", body: unknown, signal?: AbortSignal): Promise<T> { const response = await fetch(workspacePath(path), { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }); const data = await response.json().catch(() => null); if (!response.ok) throw new Error(errorMessage(data, `操作失败 (${response.status})`)); return data as T; }
export function errorMessage(value: unknown, fallback: string) { return value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : fallback; }
export function isAbortError(value: unknown) { return value instanceof DOMException && value.name === "AbortError"; }
export function assetPeriodDraftMatchesScope(draft: { companyCode: string; year: number; month: number }, scope: FinanceUiRequestScope) { return financeUiResponseMatchesScope(draft, scope); }
