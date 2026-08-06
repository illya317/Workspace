import type { AmountOriginResult, EvidenceRef } from "@workspace/finance/types/statement-explanation";
import { prisma } from "@workspace/platform/server/prisma";

import { explainAmountOrigin } from "./amount-explanation";

export interface CutoverAmountExplanationQuery {
  key: string;
  classification: "parentInvestmentOpeningAdjustment";
  sourceCompanyCode: string;
  targetAmount: string;
  currencyCode: string;
  dateFrom?: string;
  dateTo?: string;
  accountHints: readonly string[];
  evidence: string;
}

export interface CertifiedCutoverAmountExplanation {
  key: string;
  classification: CutoverAmountExplanationQuery["classification"];
  targetAmount: string;
  explainedAmount: string;
  residualAmount: string;
  method: "direct" | "formula" | "combination" | "rollforward";
  evidence: readonly EvidenceRef[];
  inputFingerprint: string;
  outputFingerprint: string;
  orchestratorVersion: string;
  policyEvidence: string;
}

interface CertificationDependencies {
  companyIdByCode: (companyCode: string) => Promise<number | null>;
  explain: (query: CutoverAmountExplanationQuery, companyId: number, dateTo: string) => Promise<AmountOriginResult>;
}

const defaultDependencies: CertificationDependencies = {
  async companyIdByCode(companyCode) {
    return (await prisma.company.findUnique({ where: { code: companyCode }, select: { id: true } }))?.id ?? null;
  },
  explain(query, companyId, dateTo) {
    return explainAmountOrigin({
      query: {
        targetAmount: query.targetAmount,
        currencyCode: query.currencyCode,
        companyIds: [companyId],
        dateFrom: query.dateFrom,
        dateTo: query.dateTo ?? dateTo,
        accountHints: query.accountHints,
        tolerance: "0.00",
        maxTerms: 1,
        sourceKinds: ["voucherLine"],
      },
    });
  },
};

export async function certifyCutoverAmountExplanations(
  queries: readonly CutoverAmountExplanationQuery[],
  baselineDate: string,
  dependencies: CertificationDependencies = defaultDependencies,
): Promise<CertifiedCutoverAmountExplanation[]> {
  const certified: CertifiedCutoverAmountExplanation[] = [];
  for (const query of queries) {
    const dateTo = query.dateTo ?? baselineDate;
    if (dateTo > baselineDate) {
      throw new Error(`切换金额解释 ${query.key} 的截止日不得晚于基线日 ${baselineDate}`);
    }
    const companyId = await dependencies.companyIdByCode(query.sourceCompanyCode);
    if (!companyId) throw new Error(`切换金额解释 ${query.key} 的来源公司不存在`);
    const result = await dependencies.explain(query, companyId, dateTo);
    const explanation = result.bestExplanation;
    if (result.status !== "exact"
      || !explanation
      || result.residualAmount !== "0.00"
      || explanation.evidence.length === 0
      || !result.method) {
      throw new Error(`切换金额解释 ${query.key} 未取得零差额精确证据`);
    }
    certified.push({
      key: query.key,
      classification: query.classification,
      targetAmount: result.targetAmount,
      explainedAmount: result.explainedAmount,
      residualAmount: result.residualAmount,
      method: result.method,
      evidence: explanation.evidence,
      inputFingerprint: result.fingerprints.input,
      outputFingerprint: result.fingerprints.output,
      orchestratorVersion: result.versions.orchestrator,
      policyEvidence: query.evidence,
    });
  }
  return certified;
}
