export type RosterGeneratedVariant = "management" | "dueDiligence";

export type RosterGeneratedStatus = "all" | "active" | "inactive";

export type RosterGeneratedColumnScope = "employee" | "row";

export interface RosterGeneratedColumn {
  key: string;
  label: string;
  scope: RosterGeneratedColumnScope;
  required?: boolean;
  defaultVisible?: boolean;
}

export type RosterGeneratedFilterValueKind = "text" | "fk";

export interface RosterGeneratedFilterField {
  key: string;
  label: string;
  valueKind: RosterGeneratedFilterValueKind;
  fkKey?: string;
  fkReturnField?: "id" | "name";
  lifecycleScope?: "active" | "all" | "archived";
}

export interface RosterGeneratedRow {
  key: string;
  cells: Record<string, string>;
}

export interface RosterGeneratedGroup {
  employeeKey: string;
  employeeCells: Record<string, string>;
  rows: RosterGeneratedRow[];
}

export interface RosterGeneratedFilters {
  variant: RosterGeneratedVariant;
  keyword?: string;
  status?: RosterGeneratedStatus;
  filterField?: string;
  filterValue?: string;
}

export interface RosterGeneratedPreview {
  variant: RosterGeneratedVariant;
  title: string;
  generatedAt: string;
  filters: RosterGeneratedFilters;
  filterFields: RosterGeneratedFilterField[];
  columns: RosterGeneratedColumn[];
  groups: RosterGeneratedGroup[];
  totalEmployees: number;
  totalRows: number;
}
