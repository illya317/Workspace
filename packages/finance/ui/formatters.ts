export function formatFinanceAmount(value: number | null | undefined): string {
  const amount = value ?? 0;
  if (Math.round(Math.abs(amount) * 100) === 0) return "0";
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCompactNullableAmount(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}
