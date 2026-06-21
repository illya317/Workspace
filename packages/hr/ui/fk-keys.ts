export const HR_ENTITY_FK_KEYS: Record<string, string> = {
  company: "hr.company",
  department: "hr.department",
  employee: "hr.employee",
  position: "hr.position",
  positionDescription: "hr.positionDescription",
  project: "work.plan",
  user: "platform.user",
};

export function fkKeyForEntity(entity: string, fkKey?: string) {
  return fkKey || HR_ENTITY_FK_KEYS[entity] || entity;
}
