/**
 * 重分类规则候选 service
 *
 * 公开 API：
 * - scanCandidates() — 返回集团科目并集中的重分类规则候选
 */

export { scanCandidates } from "./candidates";
export { saveReclassRuleChangeSet } from "./mutations";
export type {
  GroupAccountOption,
  RuleCandidate,
  ScanCandidatesResult,
} from "./types";
