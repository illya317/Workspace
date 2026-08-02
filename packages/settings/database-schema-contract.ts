export type DatabaseRelationDeleteAction = "cascade" | "restrict" | "set-null" | "set-default" | "no-action";

export interface DatabaseColumnCatalogItem {
  name: string;
  label?: string;
  type: string;
  required: boolean;
  primaryKey: boolean;
  foreignKey: boolean;
  ordinal: number;
}

export interface DatabaseTableCatalogItem {
  name: string;
  groupKey: string;
  moduleKey: string | null;
  columnCount: number;
  inboundRelationCount: number;
  outboundRelationCount: number;
  columns: DatabaseColumnCatalogItem[];
}

export interface DatabaseRelationCatalogItem {
  key: string;
  constraintName: string;
  sourceTable: string;
  sourceColumns: string[];
  targetTable: string;
  targetColumns: string[];
  onDelete: DatabaseRelationDeleteAction;
}

export interface DatabaseSchemaGroup {
  key: string;
  label: string;
  tableCount: number;
}

export interface DatabaseSchemaModule {
  key: string;
  label: string;
  level: "L1" | "L2";
  directTableCount: number;
  totalTableCount: number;
  children: DatabaseSchemaModule[];
}

export interface DatabaseSchemaCatalog {
  databaseName: string;
  schemaName: string;
  generatedAt: string;
  groups: DatabaseSchemaGroup[];
  modules: DatabaseSchemaModule[];
  unassignedTableNames: string[];
  tables: DatabaseTableCatalogItem[];
  relations: DatabaseRelationCatalogItem[];
}
