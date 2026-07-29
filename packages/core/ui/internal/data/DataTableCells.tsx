import { textOverflowTitle } from "../common/text-overflow";
import { FieldContextProvider, type FieldContextValue } from "../input/field-context";
import type { DataTableColumn } from "./DataTable.types";
import { resolveTableColumnClass } from "./table-presentation";

export function MobileTableFact<T>({
  column,
  row,
  fieldContext,
  detail = false,
}: {
  column: DataTableColumn<T>;
  row: T;
  fieldContext: FieldContextValue;
  detail?: boolean;
}) {
  return (
    <div className={detail ? "grid grid-cols-[5rem_minmax(0,1fr)] gap-3" : "min-w-0"}>
      <dt className="min-w-0 break-words text-xs font-semibold leading-5 text-slate-400">{column.label}</dt>
      <dd className={`${detail ? "" : "mt-0.5"} ${resolveTableColumnClass(column)} !w-auto !max-w-none min-w-0 whitespace-normal break-words text-sm leading-5 text-slate-700`}>
        <MobileTableValue column={column} row={row} fieldContext={fieldContext} />
      </dd>
    </div>
  );
}

export function MobileTableValue<T>({
  column,
  row,
  fieldContext,
}: {
  column: DataTableColumn<T>;
  row: T;
  fieldContext: FieldContextValue;
}) {
  return <FieldContextProvider value={fieldContext}>{column.render(row)}</FieldContextProvider>;
}

export function DesktopTableCellValue<T>({
  column,
  row,
  fieldContext,
  className,
}: {
  column: DataTableColumn<T>;
  row: T;
  fieldContext: FieldContextValue;
  className: string;
}) {
  const content = column.render(row);
  return (
    <div className={className} title={textOverflowTitle(content)}>
      <FieldContextProvider value={fieldContext}>{content}</FieldContextProvider>
    </div>
  );
}
