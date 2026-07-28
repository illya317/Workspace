export interface RelatedPartyProtectionInput {
  company: unknown | null;
  ownedInterests: readonly {
    recordStatus: string;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
  }[];
}

export interface RelatedPartyProtection {
  systemConfigured: boolean;
  systemConfiguredReason: string | null;
}

function dateKey(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function isCurrentOwnershipInterest(
  interest: RelatedPartyProtectionInput["ownedInterests"][number],
  asOfDate: string,
) {
  const effectiveFrom = dateKey(interest.effectiveFrom);
  const effectiveTo = dateKey(interest.effectiveTo);
  return interest.recordStatus === "confirmed"
    && (!effectiveFrom || effectiveFrom <= asOfDate)
    && (!effectiveTo || effectiveTo >= asOfDate);
}

export function resolveRelatedPartyProtection(
  input: RelatedPartyProtectionInput,
  asOfDate: string,
): RelatedPartyProtection {
  if (input.company) {
    return {
      systemConfigured: true,
      systemConfiguredReason: "内部公司由系统配置维护",
    };
  }
  if (input.ownedInterests.some((interest) => isCurrentOwnershipInterest(interest, asOfDate))) {
    return {
      systemConfigured: true,
      systemConfiguredReason: "当前股权关系由资本证券台账维护",
    };
  }
  return { systemConfigured: false, systemConfiguredReason: null };
}
