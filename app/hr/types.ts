// Shared types for HR module

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
  alias?: string | null;
}

// ─── Generic Tab Types ──────────────────────────────────────

export type FieldType = "text" | "number" | "boolean" | "date" | "fk" | "textarea" | "select";

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
  required?: boolean; // 新建时必填，显示*号
  hidden?: boolean; // 不展示在表格中，但新建时可用
  displayField?: string; // 表格显示用的字段路径（如 "codeRaw"）
  filterEntity?: string; // 高级筛选时调用 autocomplete 的实体（如 "employee"）
  options?: SelectOption[]; // select 类型的选项列表
  booleanLabels?: { true: string; false: string }; // boolean 类型的自定义显示文本
}

export interface FKFieldConfig {
  entity: string; // 用于 /api/hr-autocomplete?entity=xxx
  displayField: string; // 在 item 中显示名字的字段路径，如 "employee.name"
}

export interface FilterConfig {
  key: string;
  label: string;
  type?: "select" | "boolean" | "text";
  options?: Array<{ label: string; value: string }>;
  defaultValue?: string;
}

export interface TabConfig {
  title: string;
  apiPath: string;
  entityType: string; // for edit history
  fields: FieldConfig[];
  fkFields?: Record<string, FKFieldConfig>;
  canCreate?: boolean;
  canDelete?: boolean;
  listGetter?: (res: unknown) => unknown[];
  buildCreateBody?: (form: Record<string, unknown>) => Record<string, unknown>;
  filters?: FilterConfig[];
}

export interface FKOption {
  id: number;
  name: string;
  subtitle?: string;
}
