export const HR_REFERENCE_OPTIONS_ENDPOINT = "/api/modules/hr/reference-options";

export const HR_ENTITY_FK_KEYS: Record<string, string> = {
  company: "hr.company",
  department: "hr.department",
  employee: "hr.employee",
  position: "hr.position",
  positionDescription: "hr.positionDescription",
  project: "hr.employeeProject.project",
  user: "platform.user",
};

export function fkKeyForEntity(entity: string, fkKey?: string) {
  return fkKey || HR_ENTITY_FK_KEYS[entity] || entity;
}
