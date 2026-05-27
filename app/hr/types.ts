// Shared types for HR module

export interface HRUser {
  id: number;
  name: string;
  canAccessHR: boolean;
  isWorkListAdmin: boolean;
  company?: string | null;
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

export interface CodeItem {
  code: string;
  name: string;
}

// ─── Generic Tab Types ──────────────────────────────────────

export type FieldType = "text" | "number" | "boolean" | "date" | "fk" | "textarea";

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
