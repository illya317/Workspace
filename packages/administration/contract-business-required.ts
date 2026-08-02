export const CONTRACT_BUSINESS_REQUIRED_RELATION_KEYS = [
  "administration.contracts.owning.company",
  "administration.contracts.owner.department",
  "administration.contracts.party.a",
  "administration.contracts.party.b",
  "administration.contracts.handler.employee",
] as const;

export type ContractBusinessRequiredRelationKey = (
  typeof CONTRACT_BUSINESS_REQUIRED_RELATION_KEYS[number]
);

export type ContractBusinessRequiredByRelation = Readonly<Record<string, boolean | undefined>>;

export function contractBusinessRequiredPoliciesReady(
  policies: ContractBusinessRequiredByRelation,
) {
  return CONTRACT_BUSINESS_REQUIRED_RELATION_KEYS.every((relationKey) => (
    typeof policies[relationKey] === "boolean"
  ));
}
