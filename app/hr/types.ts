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
  hidden?: boolean; // 不展示在表格中，但新建时可用
}

export interface FKFieldConfig {
  entity: string; // 用于 /api/hr-autocomplete?entity=xxx
  displayField: string; // 在 item 中显示名字的字段路径，如 "employee.name"
}

export interface TabConfig {
  title: string;
  apiPath: string;
  entityType: string; // for edit history
  fields: FieldConfig[];
  fkFields?: Record<string, FKFieldConfig>;
  canCreate?: boolean;
  canDelete?: boolean;
  listGetter?: (res: any) => any[];
  buildCreateBody?: (form: Record<string, unknown>) => Record<string, unknown>;
}

export interface FKOption {
  id: number;
  name: string;
  subtitle?: string;
}
