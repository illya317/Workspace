import { createHash } from "node:crypto";

export const LEGACY_EMPLOYMENT_FIELD_TARGETS = Object.freeze({
  company: ["agreement.content.company", "socialInsurance.companyNameSnapshot", "socialInsurance.companyId"],
  insuranceStatus: ["agreement.content.insuranceStatus", "socialInsurance.insuranceStatus"],
  legalRelation: ["agreement.content.legalRelation"],
  contractType: ["agreement.content.contractType"],
  employmentForm: ["agreement.content.employmentForm"],
  confidentialityDate: ["agreement.content.confidentialityDate"],
  nonCompeteDate: ["agreement.content.nonCompeteDate"],
  isPrimary: ["agreement.isPrimary"],
  endDate: ["agreement.actualEndDate", "agreement.terms.permanent.effectiveThrough"],
  firstContractStartDate: ["agreement.terms.1.effectiveFrom"],
  firstContractEndDate: ["agreement.terms.1.effectiveThrough"],
  secondContractStartDate: ["agreement.terms.2.effectiveFrom"],
  secondContractEndDate: ["agreement.terms.2.effectiveThrough"],
  thirdContractStartDate: ["agreement.terms.3.effectiveFrom"],
  thirdContractEndDate: ["agreement.terms.3.effectiveThrough"],
  permanentContractDate: ["agreement.terms.permanent.effectiveFrom"],
});

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedRecord(rawRecord) {
  return Object.fromEntries(Object.entries(rawRecord).map(([key, value]) => [key, value === "" ? null : value]));
}

function fieldProjection(rawRecord) {
  return Object.keys(rawRecord).sort().map((field) => ({
    sourceField: field,
    mappedTo: LEGACY_EMPLOYMENT_FIELD_TARGETS[field] ?? [],
    retainedIn: ["source.raw"],
  }));
}

export function parseEmploymentLegacyItems(contracts, employmentId) {
  let parsed;
  try {
    parsed = JSON.parse(contracts);
  } catch {
    throw new Error(`Employment ${employmentId} contracts is not valid JSON`);
  }
  const records = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? [parsed] : [];
  if (records.length === 0 || records.some((record) => !record || typeof record !== "object" || Array.isArray(record))) {
    throw new Error(`Employment ${employmentId} contracts does not contain agreement objects`);
  }
  const items = records.map((rawRecord, sourceItemIndex) => ({
    sourceItemIndex,
    rawRecord,
    record: normalizedRecord(rawRecord),
    fingerprint: sha256(stableJson(rawRecord)).slice(0, 24),
    fieldProjection: fieldProjection(rawRecord),
  }));
  if (new Set(items.map((item) => item.fingerprint)).size !== items.length) {
    throw new Error(`Employment ${employmentId} contains duplicate agreements without stable identities`);
  }
  return items;
}

export function buildEmploymentLegacyProjectionArtifact(input) {
  const agreementBySourceRef = new Map(input.agreements.map((agreement) => [agreement.sourceRef, agreement]));
  const socialBySourceRef = new Map(input.socialRows.map((row) => [row.sourceRef, { outcome: "projected", row }]));
  for (const item of input.socialQuarantine) {
    socialBySourceRef.set(item.sourceRef, { outcome: "quarantined", quarantine: item });
  }
  const items = input.sources.flatMap((source) => parseEmploymentLegacyItems(source.contracts, source.employmentId).map((item) => {
    const agreementSourceRef = `employment:${source.employmentId}:${item.fingerprint}`;
    const socialSourceRef = `${agreementSourceRef}:social-insurance`;
    const agreement = agreementBySourceRef.get(agreementSourceRef);
    const socialInsurance = socialBySourceRef.get(socialSourceRef);
    if (!agreement) throw new Error(`Projection lost agreement ${agreementSourceRef}`);
    if (!socialInsurance) throw new Error(`Projection lost social-insurance decision ${socialSourceRef}`);
    return {
      source: {
        employmentId: source.employmentId,
        employeeId: source.employeeId,
        sourceItemIndex: item.sourceItemIndex,
        fingerprint: item.fingerprint,
        raw: item.rawRecord,
      },
      fieldProjection: item.fieldProjection,
      agreement: {
        sourceRef: agreement.sourceRef,
        isPrimary: agreement.isPrimary,
        actualEndDate: agreement.actualEndDate,
        content: agreement.content,
        terms: agreement.terms,
        missingFields: agreement.dataQuality.missingFields,
        incomplete: agreement.incomplete,
      },
      socialInsurance,
    };
  }));
  const sourceFieldCount = items.reduce((count, item) => count + item.fieldProjection.length, 0);
  const retainedFieldCount = items.reduce((count, item) => (
    count + item.fieldProjection.filter((field) => field.retainedIn.includes("source.raw")).length
  ), 0);
  const unmappedFieldCount = items.reduce((count, item) => (
    count + item.fieldProjection.filter((field) => field.mappedTo.length === 0).length
  ), 0);
  if (items.length !== input.agreements.length) throw new Error("Agreement projection is not source-item conservative");
  if (items.length !== input.socialRows.length + input.socialQuarantine.length) {
    throw new Error("Social-insurance projection is not source-item conservative");
  }
  if (sourceFieldCount !== retainedFieldCount) throw new Error("Projection did not retain every source field");
  return {
    schemaVersion: 1,
    kind: "hr-employment-legacy-projection",
    summary: {
      sourceDocuments: input.sources.length,
      sourceItems: items.length,
      sourceFields: sourceFieldCount,
      retainedFields: retainedFieldCount,
      unmappedFields: unmappedFieldCount,
      agreementRows: input.agreements.length,
      socialInsuranceRows: input.socialRows.length,
      quarantinedSocialInsuranceRows: input.socialQuarantine.length,
    },
    items,
  };
}
