import { workspacePath } from "@workspace/core/routing";
import type { FieldConfig, TabConfig } from "@workspace/hr/types";
import { formatEditableTableCell } from "./EditableTable";

const DEFAULT_EXPORT_PAGE_SIZE = 500;

type GenericTableExportInput = {
  config: TabConfig;
  fields: FieldConfig[];
  keyword: string;
  filters: Record<string, string>;
  pageSize?: number;
  date?: Date;
};

export async function downloadGenericTableCsv({
  config,
  fields,
  keyword,
  filters,
  pageSize = DEFAULT_EXPORT_PAGE_SIZE,
  date = new Date(),
}: GenericTableExportInput) {
  const rows = await fetchAllRows({ config, keyword, filters, pageSize });
  const content = buildCsvContent(rows, fields, config);
  downloadCsv(`${config.title}_${date.toISOString().slice(0, 10)}.csv`, content);
  return rows.length;
}

async function fetchAllRows({
  config,
  keyword,
  filters,
  pageSize,
}: Pick<GenericTableExportInput, "config" | "keyword" | "filters"> & { pageSize: number }) {
  const rows: Record<string, unknown>[] = [];
  let nextPage = 1;
  let totalRows = 0;

  do {
    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(pageSize),
    });
    if (keyword) params.set("keyword", keyword);
    for (const [key, value] of Object.entries(filters)) {
      if (value !== "" && value !== undefined && value !== null) params.set(key, value);
    }

    const response = await fetch(`${workspacePath(config.apiPath)}?${params.toString()}`);
    if (!response.ok) throw new Error("下载失败");
    const data = await response.json();
    const pageRows = config.listGetter ? config.listGetter(data) : data.items || data;
    if (!Array.isArray(pageRows)) throw new Error("下载数据格式错误");

    rows.push(...(pageRows as Record<string, unknown>[]));
    totalRows = typeof data.total === "number" ? data.total : rows.length;
    if (pageRows.length === 0) break;
    nextPage += 1;
  } while (rows.length < totalRows);

  return rows;
}

function buildCsvContent(rows: Record<string, unknown>[], fields: FieldConfig[], config: TabConfig) {
  const exportFields = fields.filter((field) => !field.createOnly);
  const header = exportFields.map((field) => escapeCsvCell(field.label)).join(",");
  const body = rows
    .map((row) =>
      exportFields
        .map((field) => escapeCsvCell(formatEditableTableCell(row, field, config).replace(/^-$/, "")))
        .join(","),
    )
    .join("\n");
  return `${header}\n${body}`;
}

function escapeCsvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
