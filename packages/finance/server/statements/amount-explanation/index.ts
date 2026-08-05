/**
 * amount-explanation capability 内部出口。
 * 注意：provider/decimal/ranker 等实现细节不进入 @workspace/finance 公共出口；
 * 公共面只经 server/index.ts 暴露 explainAmountOrigin 服务入口。
 */
export {
  AMOUNT_EXPLANATION_ORCHESTRATOR_VERSION,
  DEFAULT_AMOUNT_EXPLANATION_BUDGETS,
  explainAmountOrigin,
  type ExplainAmountOriginInput,
} from "./service";
export { orchestrateAmountOrigin, type OrchestrateInput } from "./orchestrator";
export { AmountOriginQueryError, normalizeQuery } from "./query";
export {
  DecimalNormalizationError,
  currencyScale,
  decimalLikeToMinorUnits,
  formatMinorUnits,
  numberToMinorUnits,
  parseDecimalToMinorUnits,
} from "./decimal";
export { defaultAmountEvidenceProviders } from "./providers/index";
