export function formatFinanceAmount(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCompactNullableAmount(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}
