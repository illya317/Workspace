import type { CSSProperties, ReactNode } from "react";
import type { QcLayoutBlock, QcLayoutCell, QcLayoutPart, QcTemplateTestItem } from "@/server/services/production/qc";

interface Props {
  blocks: QcLayoutBlock[];
  compact?: boolean;
  test?: Pick<QcTemplateTestItem, "sequence" | "name" | "standardText" | "conclusionName" | "hasNumericConclusion" | "cleanupItems">;
}

interface NumberedBlock extends QcLayoutBlock {
  displaySection?: string;
}

function inputWidth(part: QcLayoutPart): CSSProperties {
  return { width: part.width || "7rem" };
}

function LineInput({ part, readOnly }: { part: QcLayoutPart; readOnly?: boolean }) {
  return (
    <input
      aria-label={part.fieldKey || part.field || part.name || "填写项"}
      defaultValue={part.defaultValue}
      readOnly={readOnly || part.readonlyDisplay}
      className="mx-1 inline-block h-5 border-0 border-b border-slate-950 bg-transparent px-1 text-center align-baseline outline-none"
      style={inputWidth(part)}
    />
  );
}

function DateInput({ part }: { part: QcLayoutPart }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap align-baseline">
      <LineInput part={{ ...part, fieldKey: `${part.fieldKey || "date"}/year`, width: "3rem" }} />年
      <LineInput part={{ ...part, fieldKey: `${part.fieldKey || "date"}/month`, width: "2rem" }} />月
      <LineInput part={{ ...part, fieldKey: `${part.fieldKey || "date"}/day`, width: "2rem" }} />日
      {part.withTime && (
        <>
          <LineInput part={{ ...part, fieldKey: `${part.fieldKey || "date"}/hour`, width: "2rem" }} />时
          <LineInput part={{ ...part, fieldKey: `${part.fieldKey || "date"}/minute`, width: "2rem" }} />分
        </>
      )}
    </span>
  );
}

function ChoiceInput({ fieldKey, options = ["是", "否"], type = "radio" }: { fieldKey?: string; options?: string[]; type?: "radio" | "checkbox" }) {
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1 align-baseline">
      {options.map((option) => (
        <label key={`${fieldKey}-${option}`} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <input
            type={type}
            name={type === "radio" ? fieldKey : undefined}
            className="h-4 w-4 appearance-none border border-slate-950 bg-white align-middle checked:bg-slate-950"
          />
          <span>{option}</span>
        </label>
      ))}
    </span>
  );
}

function defaultValueForPart(part: QcLayoutPart, test?: Props["test"]) {
  if (part.defaultValue) return part.defaultValue;
  if (part.field === "重量差异限度") return test?.standardText?.match(/±\s*([\d.]+)\s*%/)?.[1];
  return undefined;
}

function Part({ part, test }: { part: QcLayoutPart; test?: Props["test"] }) {
  if (part.type === "br") return <br />;
  if (part.type === "line" || part.type === "field") return <LineInput part={{ ...part, fieldKey: part.fieldKey || part.field, defaultValue: defaultValueForPart(part, test) }} readOnly={part.readonlyDisplay} />;
  if (part.type === "date") return <DateInput part={part} />;
  if (part.type === "radio" || part.type === "checkbox") return <ChoiceInput fieldKey={part.fieldKey} options={part.options} type={part.type} />;
  if (part.type === "param") return <span>{part.defaultValue || part.name}</span>;
  if (part.type === "note") return <span className="text-slate-700">{part.text}</span>;
  return <span>{part.text}</span>;
}

function CellContent({ cell, test }: { cell: QcLayoutCell; test?: Props["test"] }) {
  if (cell.parts.length === 0) return cell.rawText ? <span>{cell.rawText}</span> : <span>&nbsp;</span>;
  return <>{cell.parts.map((part, index) => <Part key={`${part.fieldKey || part.field || part.text || part.type}-${index}`} part={part} test={test} />)}</>;
}

function TableBlock({ block, className = "", test }: { block: QcLayoutBlock; className?: string; test?: Props["test"] }) {
  if (!block.rows?.length) return null;
  return (
    <table className={`mb-4 w-full table-fixed border-collapse text-[15px] leading-7 text-slate-950 ${className}`}>
      <tbody>
        {block.rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => {
              const Tag = cell.header ? "th" : "td";
              return (
                <Tag
                  key={`${rowIndex}-${cellIndex}`}
                  colSpan={cell.colspan}
                  rowSpan={cell.rowspan}
                  className={`border border-slate-950 px-2 py-1.5 align-middle ${cell.bold || cell.header ? "font-semibold" : "font-normal"} ${cell.isEmpty ? "text-transparent" : ""}`}
                  style={{ textAlign: cell.align as CSSProperties["textAlign"], width: cell.width }}
                >
                  <CellContent cell={cell} test={test} />
                </Tag>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function numberBlocks(blocks: QcLayoutBlock[], sequence?: string): NumberedBlock[] {
  let maxSuffix = 0;
  return blocks.map((block) => {
    const suffix = block.sectionSuffix;
    let displaySection: string | undefined;
    if (suffix && /^\d+$/.test(suffix)) {
      maxSuffix = Math.max(maxSuffix, Number(suffix));
      displaySection = sequence ? `${sequence}.${suffix}` : suffix;
    } else if (suffix === "auto" || block.sectionAnchor) {
      maxSuffix += 1;
      displaySection = sequence ? `${sequence}.${maxSuffix}` : String(maxSuffix);
    }
    return { ...block, displaySection };
  });
}

function Heading({ block, fallback }: { block: NumberedBlock; fallback: string }) {
  return <h3 className="mb-2 mt-5 text-[17px] font-semibold leading-7 text-slate-950">{block.displaySection ? `${block.displaySection} ` : ""}{block.title || fallback}</h3>;
}

function ProjectHeader({ block, test }: { block: QcLayoutBlock; test?: Props["test"] }) {
  return (
    <TableBlock block={{ ...block, rows: [
      [{ rawText: `${test?.sequence || ""}  检测项目`, parts: [], colspan: 1, rowspan: 1, isEmpty: false, bold: true, align: "left" }, { rawText: test?.name || "项目名称", parts: [], colspan: 1, rowspan: 1, isEmpty: false, bold: true }, { rawText: "检验日期", parts: [], colspan: 1, rowspan: 1, isEmpty: false }, { rawText: "", parts: [{ type: "date", fieldKey: "layout/common/inspection_date" }], colspan: 1, rowspan: 1, isEmpty: false }],
      [{ rawText: "完成日期", parts: [], colspan: 1, rowspan: 1, isEmpty: false }, { rawText: "", parts: [{ type: "date", fieldKey: "layout/common/complete_date" }], colspan: 1, rowspan: 1, isEmpty: false }, { rawText: "判定日期", parts: [], colspan: 1, rowspan: 1, isEmpty: false }, { rawText: "", parts: [{ type: "date", fieldKey: "layout/common/judgment_date" }], colspan: 1, rowspan: 1, isEmpty: false }],
    ] }} />
  );
}

function EnvironmentTable({ block }: { block: NumberedBlock }) {
  const prefix = block.fieldPrefix || "layout/environment";
  return <TableBlock block={{ ...block, rows: [
    [{ rawText: `${block.displaySection ? `${block.displaySection} ` : ""}${block.title || "实验环境"}：温度：${block.temperatureRange || "10℃～30℃"}，湿度${block.humidityLimit || "≤75%"}`, parts: [], colspan: 8, rowspan: 1, isEmpty: false, bold: true, align: "left" }],
    ["房间名称", "", "房间编号", "", "温度", "℃", "湿度", "%"].map((text, index) => ({
      rawText: text,
      parts: text ? [] : [{ type: "line", fieldKey: `${prefix}/field_${index}`, width: "7rem" }],
      colspan: 1,
      rowspan: 1,
      isEmpty: false,
    })),
  ] }} />;
}

function EquipmentTable({ block }: { block: NumberedBlock }) {
  const prefix = block.fieldPrefix || "layout/equipment";
  const devices = block.devices?.length ? block.devices : [{ name: "仪器、设备", status: "“已清洁”" }];
  return <TableBlock block={{ ...block, rows: [
    [{ rawText: `${block.displaySection ? `${block.displaySection} ` : ""}${block.title || "仪器、设备"}`, parts: [], colspan: 5, rowspan: 1, isEmpty: false, bold: true, align: "left" }],
    ["仪器、设备", "设备编号", "设备状态", "校验有效期至", "是否确认"].map((text) => ({ rawText: text, parts: [], colspan: 1, rowspan: 1, isEmpty: false })),
    ...devices.map((device, index) => [
      { rawText: device.name, parts: [], colspan: 1, rowspan: 1, isEmpty: false },
      { rawText: "", parts: [{ type: "line", fieldKey: `${prefix}/device_no_${index + 1}`, width: "8rem" }], colspan: 1, rowspan: 1, isEmpty: false },
      { rawText: device.status || "“已清洁”", parts: [], colspan: 1, rowspan: 1, isEmpty: false },
      { rawText: "", parts: [{ type: "line", fieldKey: `${prefix}/valid_until_${index + 1}`, width: "8rem" }], colspan: 1, rowspan: 1, isEmpty: false },
      { rawText: "", parts: [{ type: "radio", fieldKey: `${prefix}/confirmed_${index + 1}`, options: ["是", "否"] }], colspan: 1, rowspan: 1, isEmpty: false },
    ]),
  ] }} />;
}

function PostSection({ block, title, children }: { block: NumberedBlock; title: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <Heading block={block} fallback={title} />
      <div className="text-[15px] leading-7 text-slate-950">{children}</div>
    </section>
  );
}

function RenderBlock({ block, test }: { block: NumberedBlock; test?: Props["test"] }) {
  if (block.type === "project_header") return <ProjectHeader block={block} test={test} />;
  if (block.type === "environment_table") return <EnvironmentTable block={block} />;
  if (block.type === "equipment_table") return <EquipmentTable block={block} />;
  if (block.type === "title") return <Heading block={block} fallback="操作方法" />;
  if (block.type === "operation_text") return <p className="mb-5 [text-indent:2em] text-[15px] leading-8 text-slate-950">{block.text}</p>;
  if (block.type === "paragraph") return <p className="mb-3 text-[15px] leading-8 text-slate-950">{block.parts?.map((part, index) => <Part key={index} part={part} test={test} />)}</p>;
  if (block.type === "standard_text") return <PostSection block={block} title="标准规定">{test?.standardText || "YAML 未配置标准规定"}</PostSection>;
  if (block.type === "abnormal_handling") return <PostSection block={block} title="实验结果异常处理"><ChoiceInput fieldKey={`${block.fieldPrefix || "layout/abnormal"}/occurred`} /> <span className="ml-8">实验室异常情况编号</span><LineInput part={{ type: "line", fieldKey: `${block.fieldPrefix || "layout/abnormal"}/code`, width: "14rem" }} /></PostSection>;
  if (block.type === "cleanup_checklist") return <PostSection block={block} title="清场">{(test?.cleanupItems?.length ? test.cleanupItems : block.items || ["YAML 未配置清场项目"]).map((item, index) => <div key={item} className="flex items-center justify-between border-b border-slate-950 py-1"><span>{item.replace(/[。.]?$/, "。")}</span><ChoiceInput fieldKey={`${block.fieldPrefix || "layout/cleanup"}/item_${index + 1}`} /></div>)}</PostSection>;
  if (block.type === "conclusion") return <PostSection block={block} title="结论">批号<LineInput part={{ type: "line", fieldKey: "batch_number", width: "8rem" }} />{test?.name || "本品"}（{block.conclusionName || test?.conclusionName || test?.name || "结论"}）检测过程<ChoiceInput fieldKey="layout/conclusion/process" options={["符合", "不符合"]} />各项规定，结果<ChoiceInput fieldKey="layout/conclusion/result" options={["符合", "不符合"]} />标准规定。</PostSection>;
  if (block.type === "table") return <TableBlock block={block} test={test} />;
  return block.text ? <p className="mb-3 text-[15px] leading-8 text-slate-950">{block.text}</p> : null;
}

export default function QcLayoutPaper({ blocks, compact, test }: Props) {
  const numberedBlocks = numberBlocks(blocks, test?.sequence);
  return (
    <div
      className={compact ? "max-h-[70vh] overflow-auto" : ""}
      style={{ fontFamily: "\"FangSong\", \"STFangsong\", \"FangSong_GB2312\", \"仿宋\", serif" }}
    >
      {numberedBlocks.map((block, index) => <RenderBlock key={`${block.label || block.type}-${index}`} block={block} test={test} />)}
    </div>
  );
}
