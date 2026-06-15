import type { CSSProperties } from "react";
import type { QcLayoutBlock, QcLayoutCell, QcLayoutPart } from "@/server/services/production/qc";

interface Props {
  blocks: QcLayoutBlock[];
  compact?: boolean;
}

function inputWidth(part: QcLayoutPart): CSSProperties {
  return { width: part.width || "7rem" };
}

function LineInput({ part }: { part: QcLayoutPart }) {
  return (
    <input
      aria-label={part.fieldKey || "填写项"}
      className="mx-1 inline-block h-6 border-0 border-b border-slate-950 bg-transparent px-1 align-baseline outline-none"
      style={inputWidth(part)}
    />
  );
}

function DateInput({ part }: { part: QcLayoutPart }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap align-baseline">
      <input aria-label={`${part.fieldKey || "日期"}年`} className="h-6 w-12 border-0 border-b border-slate-950 bg-transparent text-center outline-none" />年
      <input aria-label={`${part.fieldKey || "日期"}月`} className="h-6 w-8 border-0 border-b border-slate-950 bg-transparent text-center outline-none" />月
      <input aria-label={`${part.fieldKey || "日期"}日`} className="h-6 w-8 border-0 border-b border-slate-950 bg-transparent text-center outline-none" />日
      {part.withTime && (
        <>
          <input aria-label={`${part.fieldKey || "日期"}时`} className="h-6 w-8 border-0 border-b border-slate-950 bg-transparent text-center outline-none" />时
          <input aria-label={`${part.fieldKey || "日期"}分`} className="h-6 w-8 border-0 border-b border-slate-950 bg-transparent text-center outline-none" />分
        </>
      )}
    </span>
  );
}

function ChoiceInput({ part, type }: { part: QcLayoutPart; type: "radio" | "checkbox" }) {
  const options = part.options?.length ? part.options : ["是", "否"];
  return (
    <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1 align-baseline">
      {options.map((option) => (
        <label key={`${part.fieldKey}-${option}`} className="inline-flex items-center gap-1 whitespace-nowrap">
          <input
            type={type}
            name={type === "radio" ? part.fieldKey : undefined}
            className="h-4 w-4 appearance-none border border-slate-950 bg-white align-middle checked:bg-slate-950"
          />
          <span>{option}</span>
        </label>
      ))}
    </span>
  );
}

function Part({ part }: { part: QcLayoutPart }) {
  if (part.type === "line") return <LineInput part={part} />;
  if (part.type === "date") return <DateInput part={part} />;
  if (part.type === "radio") return <ChoiceInput part={part} type="radio" />;
  if (part.type === "checkbox") return <ChoiceInput part={part} type="checkbox" />;
  if (part.type === "note") return <span className="text-slate-700">{part.text}</span>;
  return <span>{part.text}</span>;
}

function CellContent({ cell }: { cell: QcLayoutCell }) {
  if (cell.parts.length === 0) return cell.rawText ? <span>{cell.rawText}</span> : <span>&nbsp;</span>;
  return (
    <>
      {cell.parts.map((part, index) => (
        <Part key={`${part.fieldKey || part.text || part.type}-${index}`} part={part} />
      ))}
    </>
  );
}

function TableBlock({ block }: { block: QcLayoutBlock }) {
  return (
    <table className="mb-4 w-full table-fixed border-collapse text-sm leading-8 text-slate-950">
      <tbody>
        {block.rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td
                key={`${rowIndex}-${cellIndex}`}
                colSpan={cell.colspan}
                rowSpan={cell.rowspan}
                className={`border border-slate-950 px-2 py-1 align-middle ${cell.isEmpty ? "text-transparent" : ""}`}
              >
                <CellContent cell={cell} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function QcLayoutPaper({ blocks, compact }: Props) {
  return (
    <div className={compact ? "max-h-[70vh] overflow-auto" : ""}>
      {blocks.map((block, index) => (
        <TableBlock key={`${block.label || block.type}-${index}`} block={block} />
      ))}
    </div>
  );
}
