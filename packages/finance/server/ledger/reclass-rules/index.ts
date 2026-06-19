/**
 * 重分类规则候选 service
 *
 * 公开 API：
 * - scanCandidates(params) — 扫描凭证明细，返回异常方向候选科目列表
 */

export { scanCandidates } from "./candidates";
export type {
  ScanCandidatesParams,
  RuleCandidate,
  ScanCandidatesResult,
} from "./types";
