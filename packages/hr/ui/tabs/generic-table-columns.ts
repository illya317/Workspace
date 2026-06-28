import type { FieldConfig } from "@workspace/hr/types";

type CompanyOption = { label: string; value: string };

export function fieldsWithCompanyOptions(fields: FieldConfig[], companyOptions: CompanyOption[]) {
  return fields.map((field) =>
    field.optionsSource === "companies" ? { ...field, options: companyOptions } : field,
  );
}

export function defaultVisibleColumnKeys(fields: FieldConfig[]) {
  const defaults = fields
    .filter((field) => field.required || field.defaultVisible)
    .map((field) => field.key);
  return defaults.length > 0
    ? defaults
    : fields.filter((field) => !field.hidden).map((field) => field.key);
}

export function columnToggleOptions(fields: FieldConfig[]) {
  return fields.map((field) => ({
    key: field.key,
    label: field.label,
    required: field.required,
    defaultVisible: field.defaultVisible,
  }));
}
