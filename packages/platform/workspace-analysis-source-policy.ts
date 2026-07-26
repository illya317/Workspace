import { findApiContract } from "./api-registry";

export function validateWorkspaceAnalysisSourcePath(path: string) {
  if (path.startsWith("/api/modules/finance/cost/operational-analytics")) {
    return "不能递归读取经营分析接口";
  }
  return validateProtectedBusinessReadPath(path);
}

export function validateRegisteredWorkspaceAnalysisSourcePath(path: string) {
  if (path.startsWith("/api/modules/finance/cost/operational-analytics/spaces")) {
    return "登记数据源不能读取经营分析模板、权限或运行结果";
  }
  return validateProtectedBusinessReadPath(path);
}

function validateProtectedBusinessReadPath(path: string) {
  if (/\/(?:export|download|preview|office-viewer|attachments)(?:\/|$)/.test(path)) {
    return "导出、下载、预览或附件接口不是稳定分析数据集";
  }
  if (/\/(?:reference-options|autocomplete|search|group-account-options|entry-source-options|lookup-period)(?:\/|$)/.test(path)) {
    return "联想、搜索和下拉选项接口不是完整稳定的数据集";
  }
  if (/\/spaces(?:\/[^/]+\/[^/]+)?\/permissions(?:\/|$)/.test(path)) {
    return "空间权限矩阵属于控制面，不能作为经营分析事实";
  }
  if (path === "/api/settings/account/api-key" || path.startsWith("/api/settings/api/open/clients")) {
    return "凭证与访问密钥接口不能作为分析数据源";
  }
  if (path.startsWith("/api/settings/account/")) {
    return "个人偏好与账号设置属于控制面，不能作为经营分析事实";
  }
  const contract = findApiContract("GET", path);
  if (!contract) return "不是已注册的 Workspace GET 接口";
  if (contract.access !== "protected" || contract.apiKind !== "business" || !contract.resourceKey) {
    return "只能读取已注册且受权限保护的业务接口";
  }
  return null;
}
