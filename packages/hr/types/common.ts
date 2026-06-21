export interface HRUser {
  id: number;
  name: string;
  /** All resource keys the user can access (DB-driven). */
  visibleResourceKeys: string[];
  /** Resource keys the user can write to. */
  visibleWriteResourceKeys: string[];
  isAdmin: boolean;
  company?: string | null;
}

/** Check if a resource key is in the user's visible set. */
export function hrCanAccess(user: HRUser, key: string): boolean {
  return user.visibleResourceKeys.includes(key);
}

/** Check if user has write permission on a resource. */
export function hrCanEdit(user: HRUser, key: string = "people.roster"): boolean {
  return user.isAdmin || user.visibleWriteResourceKeys.includes(key);
}

export interface RosterEmployee {
  id: number;
  employeeId: string;
  name: string;
  company: string | null;
  center: string | null;
  dept1: string | null;
  dept2: string | null;
  position: string | null;
  gender: string | null;
  ethnicity: string | null;
  hometown: string | null;
  politics: string | null;
  education: string | null;
  title: string | null;
  school: string | null;
  major: string | null;
  phone: string | null;
  joinDate: string | null;
  nature: string | null;
  status?: string | null;
  leaveDate?: string | null;
  leaveReason?: string | null;
  leaveNote?: string | null;
  alias?: string | null;
}

export type FieldType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "fk"
  | "textarea"
  | "select"
  | "tags"
  | "major"
  | "school"
  | "professionalTitle"
  | "phone"
  | "chineseId";

export interface SelectOption {
  label: string;
  value: string;
}

export interface FieldConfig {
  key: string;
  label: string;
  editable?: boolean;
  type?: FieldType;
  width?: string;
  createOnly?: boolean;
  required?: boolean;
  defaultVisible?: boolean;
  hidden?: boolean;
  displayField?: string;
  filterEntity?: string;
  options?: SelectOption[];
  optionsSource?: string;
  booleanLabels?: { true: string; false: string };
}

export interface FKFieldConfig {
  entity: string;
  fkKey?: string;
  displayField: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  type?: "select" | "boolean" | "text";
  options?: Array<{ label: string; value: string }>;
  defaultValue?: string;
}

export type AdvancedFilterKind = "text" | "boolean" | "select" | "date" | "fk";

export interface AdvancedFilterConfig {
  key: string;
  label: string;
  queryParam: string;
  kind: AdvancedFilterKind;
  placeholder?: string;
  options?: SelectOption[];
  entity?: string;
  fkKey?: string;
  returnField?: "id" | "name";
}

export interface TabConfig {
  title: string;
  apiPath: string;
  entityType: string;
  fields: FieldConfig[];
  fkFields?: Record<string, FKFieldConfig>;
  canCreate?: boolean;
  canDelete?: boolean;
  listGetter?: (res: unknown) => unknown[];
  buildCreateBody?: (form: Record<string, unknown>) => Record<string, unknown>;
  filters?: FilterConfig[];
  advancedFilters?: AdvancedFilterConfig[];
}

export interface FKOption {
  id: number;
  name: string;
  subtitle?: string;
}
