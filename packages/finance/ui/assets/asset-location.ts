export type AssetWorkspaceView = "cards" | "policies" | "period" | "adjustments";
export type AssetPolicyScope = "group" | "company";

export function isAssetWorkspaceView(value: unknown): value is AssetWorkspaceView {
  return value === "cards" || value === "policies" || value === "period" || value === "adjustments";
}

export function assetLocationFromSearch(search: string, allowedViews: AssetWorkspaceView[]) {
  const params = new URLSearchParams(search);
  const requestedView = params.get("view");
  const year = Number(params.get("year"));
  const month = Number(params.get("month"));
  return {
    view: isAssetWorkspaceView(requestedView) && allowedViews.includes(requestedView) ? requestedView : null,
    policyScope: isAssetPolicyScope(params.get("policyScope")) ? params.get("policyScope") as AssetPolicyScope : null,
    companyCode: params.get("companyCode")?.trim() || null,
    year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null,
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : null,
  };
}

export function assetLocationSearch(input: { view: AssetWorkspaceView; policyScope?: AssetPolicyScope; companyCode: string; year: string; month: string }) {
  const params = new URLSearchParams();
  params.set("view", input.view);
  if (input.view === "policies" && input.policyScope) params.set("policyScope", input.policyScope);
  if (input.companyCode) params.set("companyCode", input.companyCode);
  if (input.year) params.set("year", input.year);
  if (input.month) params.set("month", input.month);
  return `?${params.toString()}`;
}

function isAssetPolicyScope(value: unknown): value is AssetPolicyScope {
  return value === "group" || value === "company";
}
