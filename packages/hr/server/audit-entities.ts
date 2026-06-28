export const HR_AUDIT_ENTITY_TYPES = [
  "Employee",
  "Employment",
  "Company",
  "CompanyRelation",
  "Department",
  "Position",
  "EDP",
  "PositionDescription",
] as const;

const HR_AUDIT_ENTITY_TYPE_SET = new Set<string>(HR_AUDIT_ENTITY_TYPES);

export function isHrAuditEntityType(entityType: string) {
  return HR_AUDIT_ENTITY_TYPE_SET.has(entityType);
}
