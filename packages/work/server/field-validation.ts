export function isValidDateValue(value: unknown) {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

export function rejectInvalidDateField(field: string, value: unknown, dateFields: readonly string[]) {
  if (!dateFields.includes(field)) return { field, value };
  return isValidDateValue(value) ? { field, value } : null;
}
