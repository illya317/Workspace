export function policyEffectiveDate(value: string | Date) {
  if (value instanceof Date) return value;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("无效的政策版本生效日期");
  return date;
}

export function isFinanceAccountingPolicyVersionEffectiveAt(
  version: { effectiveFrom: Date | null; effectiveTo: Date | null },
  effectiveAt: string | Date,
) {
  const date = policyEffectiveDate(effectiveAt);
  return (!version.effectiveFrom || version.effectiveFrom <= date)
    && (!version.effectiveTo || version.effectiveTo > date);
}
