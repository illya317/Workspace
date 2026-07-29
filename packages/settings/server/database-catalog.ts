import "server-only";

import { Prisma, prisma } from "@workspace/platform/server/prisma";

import type {
  DatabaseRelationCatalogItem,
  DatabaseRelationDeleteAction,
  DatabaseSchemaCatalog,
  DatabaseTableCatalogItem,
} from "../database-schema-contract";

interface DatabaseColumnRow {
  tableName: string;
  name: string;
  label?: string | null;
  type: string;
  required: boolean;
  primaryKey: boolean;
  ordinal: number;
}

interface DatabaseRelationRow {
  constraintName: string;
  sourceTable: string;
  sourceColumns: string[];
  targetTable: string;
  targetColumns: string[];
  deleteCode: string;
}

interface DatabaseIdentityRow {
  databaseName: string;
  schemaName: string;
}

const GROUPS = [
  { key: "finance", label: "财务" },
  { key: "work", label: "工作" },
  { key: "hr", label: "人力资源" },
  { key: "administration", label: "行政合同" },
  { key: "inventory", label: "库存" },
  { key: "production", label: "生产与产品" },
  { key: "external", label: "外部关系" },
  { key: "capital", label: "资本证券" },
  { key: "library", label: "资料库" },
  { key: "docs", label: "文档" },
  { key: "workflow", label: "流程" },
  { key: "agent", label: "智能体" },
  { key: "platform", label: "系统底座" },
] as const;

const GROUP_PREFIXES: ReadonlyArray<{ key: string; prefixes: readonly string[] }> = [
  { key: "finance", prefixes: ["Finance"] },
  { key: "work", prefixes: ["Work", "Project", "Meeting", "DepartmentCollaboration", "DepartmentWork", "ProjectWork", "WorkspaceAnalysis"] },
  { key: "capital", prefixes: ["Ownership", "Share", "CompanyRegistry"] },
  { key: "hr", prefixes: ["Employee", "Employment", "Department", "Position", "Company", "EDP", "Performance", "Org"] },
  { key: "administration", prefixes: ["Contract", "ErpDueDiligence"] },
  { key: "inventory", prefixes: ["Inventory", "Stock", "FinishedGoods"] },
  { key: "production", prefixes: ["Product", "Quality", "Qc", "QC"] },
  { key: "external", prefixes: ["Party", "External"] },
  { key: "library", prefixes: ["Library"] },
  { key: "docs", prefixes: ["DocumentTemplate", "DocumentSubmission"] },
  { key: "workflow", prefixes: ["Approval", "Workflow"] },
  { key: "agent", prefixes: ["Agent"] },
];

function groupKeyForTable(tableName: string) {
  return GROUP_PREFIXES.find((group) => group.prefixes.some((prefix) => tableName.startsWith(prefix)))?.key ?? "platform";
}

function deleteAction(code: string): DatabaseRelationDeleteAction {
  if (code === "c") return "cascade";
  if (code === "r") return "restrict";
  if (code === "n") return "set-null";
  if (code === "d") return "set-default";
  return "no-action";
}

function chineseColumnLabel(value: string | null | undefined) {
  const label = value?.trim();
  return label && /\p{Script=Han}/u.test(label) ? label : undefined;
}

export function buildDatabaseSchemaCatalog(
  identity: DatabaseIdentityRow,
  columnRows: readonly DatabaseColumnRow[],
  relationRows: readonly DatabaseRelationRow[],
): DatabaseSchemaCatalog {
  const relations: DatabaseRelationCatalogItem[] = relationRows.map((row) => ({
    key: `${row.sourceTable}.${row.sourceColumns.join(",")}->${row.targetTable}.${row.targetColumns.join(",")}`,
    constraintName: row.constraintName,
    sourceTable: row.sourceTable,
    sourceColumns: row.sourceColumns,
    targetTable: row.targetTable,
    targetColumns: row.targetColumns,
    onDelete: deleteAction(row.deleteCode),
  }));
  const foreignKeyFields = new Set(relations.flatMap((relation) =>
    relation.sourceColumns.map((column) => `${relation.sourceTable}.${column}`)));
  const columnsByTable = new Map<string, DatabaseColumnRow[]>();
  for (const row of columnRows) {
    const columns = columnsByTable.get(row.tableName) ?? [];
    columns.push(row);
    columnsByTable.set(row.tableName, columns);
  }
  const inboundCounts = new Map<string, number>();
  const outboundCounts = new Map<string, number>();
  for (const relation of relations) {
    inboundCounts.set(relation.targetTable, (inboundCounts.get(relation.targetTable) ?? 0) + 1);
    outboundCounts.set(relation.sourceTable, (outboundCounts.get(relation.sourceTable) ?? 0) + 1);
  }
  const tables: DatabaseTableCatalogItem[] = [...columnsByTable.entries()].map(([name, rows]) => ({
    name,
    groupKey: groupKeyForTable(name),
    columnCount: rows.length,
    inboundRelationCount: inboundCounts.get(name) ?? 0,
    outboundRelationCount: outboundCounts.get(name) ?? 0,
    columns: [...rows]
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((row) => ({
        name: row.name,
        label: chineseColumnLabel(row.label),
        type: row.type,
        required: row.required,
        primaryKey: row.primaryKey,
        foreignKey: foreignKeyFields.has(`${row.tableName}.${row.name}`),
        ordinal: row.ordinal,
      })),
  })).sort((left, right) => left.name.localeCompare(right.name));
  const groupCounts = new Map<string, number>();
  for (const table of tables) groupCounts.set(table.groupKey, (groupCounts.get(table.groupKey) ?? 0) + 1);

  return {
    databaseName: identity.databaseName,
    schemaName: identity.schemaName,
    generatedAt: new Date().toISOString(),
    groups: GROUPS
      .map((group) => ({ ...group, tableCount: groupCounts.get(group.key) ?? 0 }))
      .filter((group) => group.tableCount > 0),
    tables,
    relations,
  };
}

export async function listDatabaseSchemaCatalog(): Promise<DatabaseSchemaCatalog> {
  const [identity] = await prisma.$queryRaw<DatabaseIdentityRow[]>(Prisma.sql`
    SELECT current_database() AS "databaseName", current_schema() AS "schemaName"
  `);
  const columnRows = await prisma.$queryRaw<DatabaseColumnRow[]>(Prisma.sql`
    SELECT
      relation.relname AS "tableName",
      attribute.attname AS "name",
      pg_catalog.col_description(relation.oid, attribute.attnum) AS "label",
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS "type",
      attribute.attnotnull AS "required",
      COALESCE(primary_key.attnum IS NOT NULL, FALSE) AS "primaryKey",
      attribute.attnum::integer AS "ordinal"
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_attribute attribute
      ON attribute.attrelid = relation.oid
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
    LEFT JOIN LATERAL (
      SELECT unnest(constraint_row.conkey) AS attnum
      FROM pg_catalog.pg_constraint constraint_row
      WHERE constraint_row.conrelid = relation.oid AND constraint_row.contype = 'p'
    ) primary_key ON primary_key.attnum = attribute.attnum
    WHERE namespace.nspname = current_schema()
      AND relation.relkind IN ('r', 'p')
      AND relation.relname <> '_prisma_migrations'
    ORDER BY relation.relname, attribute.attnum
  `);
  const relationRows = await prisma.$queryRaw<DatabaseRelationRow[]>(Prisma.sql`
    SELECT
      constraint_row.conname AS "constraintName",
      source_relation.relname AS "sourceTable",
      array_agg(source_attribute.attname::text ORDER BY relation_key.ordinality)::text[] AS "sourceColumns",
      target_relation.relname AS "targetTable",
      array_agg(target_attribute.attname::text ORDER BY relation_key.ordinality)::text[] AS "targetColumns",
      constraint_row.confdeltype::text AS "deleteCode"
    FROM pg_catalog.pg_constraint constraint_row
    JOIN pg_catalog.pg_class source_relation ON source_relation.oid = constraint_row.conrelid
    JOIN pg_catalog.pg_namespace source_namespace ON source_namespace.oid = source_relation.relnamespace
    JOIN pg_catalog.pg_class target_relation ON target_relation.oid = constraint_row.confrelid
    JOIN pg_catalog.pg_namespace target_namespace ON target_namespace.oid = target_relation.relnamespace
    CROSS JOIN LATERAL unnest(constraint_row.conkey, constraint_row.confkey)
      WITH ORDINALITY AS relation_key(source_attnum, target_attnum, ordinality)
    JOIN pg_catalog.pg_attribute source_attribute
      ON source_attribute.attrelid = source_relation.oid AND source_attribute.attnum = relation_key.source_attnum
    JOIN pg_catalog.pg_attribute target_attribute
      ON target_attribute.attrelid = target_relation.oid AND target_attribute.attnum = relation_key.target_attnum
    WHERE constraint_row.contype = 'f'
      AND source_namespace.nspname = current_schema()
      AND target_namespace.nspname = current_schema()
    GROUP BY constraint_row.conname, source_relation.relname, target_relation.relname, constraint_row.confdeltype
    ORDER BY source_relation.relname, constraint_row.conname
  `);

  if (!identity) throw new Error("DATABASE_SCHEMA_IDENTITY_UNAVAILABLE");
  return buildDatabaseSchemaCatalog(identity, columnRows, relationRows);
}
