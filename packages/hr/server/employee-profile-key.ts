export function employeeWhereFromKey(key: string) {
  let value: string;
  try {
    value = decodeURIComponent(key).trim();
  } catch {
    return null;
  }
  if (!value || value.length > 80 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  if (/^\d{5}$/.test(value)) return { employeeId: value };
  if (/^\d+$/.test(value)) {
    const numericId = Number(value);
    return Number.isSafeInteger(numericId) && numericId > 0 ? { id: numericId } : null;
  }
  return { employeeId: value };
}
