import type { FinanceCloseScope } from "../../types/close";

const VOUCHER_ITEM_PREFIX = "finance-voucher-item:";
const EXTERNAL_SHA256_PREFIX = "external-sha256:";

export type FinanceCloseVoucherItemEvidenceFact = {
  id: number;
  voucher: {
    companyCode: string;
    status: string;
    periodId: number;
    period: { companyCode: string; year: number; month: number };
  };
};

export type FinanceCloseWorkpaperEvidenceDependencies = {
  findVoucherItems(ids: number[]): Promise<FinanceCloseVoucherItemEvidenceFact[]>;
};

type EvidenceScope = FinanceCloseScope & { periodId?: number };

export type FinanceCloseWorkpaperEvidenceInspection = {
  invalidRefs: string[];
  staleInternalRefs: string[];
  verifiedInternalRefs: string[];
  hashedExternalRefs: string[];
  supplementalRefs: string[];
  hasGovernedEvidence: boolean;
};

export async function inspectFinanceCloseWorkpaperEvidence(
  refs: string[],
  scope: EvidenceScope,
  deps: FinanceCloseWorkpaperEvidenceDependencies,
): Promise<FinanceCloseWorkpaperEvidenceInspection> {
  const parsed = refs.map((ref) => ({ ref, value: parseEvidenceReference(ref) }));
  const invalidRefs = parsed.filter((item) => item.value === null).map((item) => item.ref);
  const voucherItemRefs = parsed.flatMap((item) => item.value?.kind === "voucher_item"
    ? [{ ref: item.ref, id: item.value.id }]
    : []);
  const voucherItemIds = [...new Set(voucherItemRefs.map((item) => item.id))];
  const facts = await deps.findVoucherItems(voucherItemIds);
  const factById = new Map(facts.map((fact) => [fact.id, fact]));
  const staleInternalRefs = voucherItemRefs.flatMap((item) => {
    const fact = factById.get(item.id);
    const periodMatches = fact?.voucher.period.companyCode === scope.companyCode
      && fact.voucher.period.year === scope.year
      && fact.voucher.period.month === scope.month
      && (scope.periodId === undefined || fact.voucher.periodId === scope.periodId);
    return fact?.voucher.companyCode === scope.companyCode && fact.voucher.status === "posted" && periodMatches
      ? []
      : [item.ref];
  });
  const stale = new Set(staleInternalRefs);
  const verifiedInternalRefs = voucherItemRefs.filter((item) => !stale.has(item.ref)).map((item) => item.ref);
  const hashedExternalRefs = parsed.flatMap((item) => item.value?.kind === "hashed_external" ? [item.ref] : []);
  const supplementalRefs = parsed.flatMap((item) => item.value?.kind === "supplemental" ? [item.ref] : []);
  return {
    invalidRefs,
    staleInternalRefs,
    verifiedInternalRefs,
    hashedExternalRefs,
    supplementalRefs,
    hasGovernedEvidence: verifiedInternalRefs.length + hashedExternalRefs.length > 0,
  };
}

type ParsedEvidenceReference =
  | { kind: "voucher_item"; id: number }
  | { kind: "hashed_external" }
  | { kind: "supplemental" };

function parseEvidenceReference(value: string): ParsedEvidenceReference | null {
  if (value.startsWith(VOUCHER_ITEM_PREFIX)) {
    const rawId = value.slice(VOUCHER_ITEM_PREFIX.length);
    if (!/^[1-9]\d*$/u.test(rawId)) return null;
    const id = Number(rawId);
    return Number.isSafeInteger(id) ? { kind: "voucher_item", id } : null;
  }
  if (value.startsWith(EXTERNAL_SHA256_PREFIX)) {
    const match = /^external-sha256:([0-9a-f]{64}):(https:\/\/\S+)$/u.exec(value);
    return match && strictHttpsUrl(match[2]!) ? { kind: "hashed_external" } : null;
  }
  if (/^document:[1-9]\d*$/u.test(value)) return { kind: "supplemental" };
  if (strictHttpsUrl(value)) return { kind: "supplemental" };
  return null;
}

function strictHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}
