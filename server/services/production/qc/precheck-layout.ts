import type {
  QcLayoutBlock,
  QcLayoutCell,
  QcTemplatePrecheckFile,
  QcTemplatePrecheckItem,
} from "./types";

function textCell(rawText: string, options: Partial<QcLayoutCell> = {}): QcLayoutCell {
  return {
    rawText,
    parts: [],
    colspan: 1,
    rowspan: 1,
    isEmpty: false,
    align: "center",
    ...options,
  };
}

function partCell(parts: QcLayoutCell["parts"], options: Partial<QcLayoutCell> = {}): QcLayoutCell {
  return {
    rawText: "",
    parts,
    colspan: 1,
    rowspan: 1,
    isEmpty: false,
    align: "center",
    ...options,
  };
}

function fileNameText(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("《") && trimmed.endsWith("》") ? trimmed : `《${trimmed}》`;
}

function fileWithCodeText(file: QcTemplatePrecheckFile) {
  const name = fileNameText(file.name);
  if (!name) return "";
  const code = file.code.trim();
  return code && !name.includes(code) ? `${name}（${code}）` : name;
}

function basisText(precheckInfo: Record<string, string>, files: QcTemplatePrecheckFile[]) {
  const explicit = precheckInfo["检验依据"]?.trim();
  if (explicit) return explicit;
  return files.slice(0, 2).map(fileWithCodeText).filter(Boolean).join("、");
}

export function buildPrecheckLayoutBlocks(
  productName: string,
  stageLabel: string,
  precheckInfo: Record<string, string>,
  files: QcTemplatePrecheckFile[],
  items: QcTemplatePrecheckItem[],
  environment: Record<string, unknown>,
): QcLayoutBlock[] {
  const basis = basisText(precheckInfo, files);
  const environmentOptions = Object.entries(environment)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
  const envOptions = environmentOptions.length ? environmentOptions : ["符合要求", "不符合要求"];

  return [
    {
      type: "table",
      label: "precheck-header",
      rows: [
        [
          textCell("批号", { width: "15%" }),
          partCell([{ type: "line", fieldKey: "batch_number", width: "8em" }], { width: "35%" }),
          textCell("包装情况", { width: "15%" }),
          textCell(precheckInfo["包装情况"] || "", { width: "35%" }),
        ],
        [
          textCell("检品名称"),
          textCell(precheckInfo["检品名称"] || `${productName}${stageLabel}`),
          textCell("检品数量"),
          partCell([{ type: "line", fieldKey: "pre_check/quantity", width: "4em" }]),
        ],
        [
          textCell("检验目的"),
          textCell(precheckInfo["检验目的"] || ""),
          textCell("检品数量"),
          partCell([{ type: "line", fieldKey: "pre_check/quantity_2", width: "4em" }]),
        ],
        [
          textCell("请验部门"),
          textCell(precheckInfo["请验部门"] || ""),
          textCell("请验日期"),
          partCell([{ type: "date", fieldKey: "pre_check/request_date" }]),
        ],
        [
          textCell("检验日期"),
          partCell([{ type: "date", fieldKey: "pre_check/inspect_date" }]),
          textCell("报告日期"),
          partCell([{ type: "date", fieldKey: "pre_check/report_date" }]),
        ],
        [
          textCell("检验依据"),
          textCell(basis, { colspan: 3 }),
        ],
      ],
    },
    {
      type: "table",
      label: "precheck-files",
      rows: [
        [textCell("1 检验前确认", { colspan: 3, bold: true, align: "left" })],
        [textCell("1.1 文件", { colspan: 3, bold: true, align: "left" })],
        [
          textCell("文件名称", { width: "55%" }),
          textCell("文件编码", { width: "25%" }),
          textCell("是否在实验现场", { width: "20%" }),
        ],
        ...files.map((file, index) => [
          textCell(fileNameText(file.name)),
          textCell(file.code),
          partCell([{ type: "radio", fieldKey: `pre_check/file_${index + 1}`, options: ["是", "否"] }]),
        ]),
      ],
    },
    {
      type: "table",
      label: "precheck-confirm",
      rows: [
        ...items.map((item, index) => [
          textCell(`1.${index + 2} ${item.name}`, { bold: true, align: "left" }),
          partCell([{ type: "radio", fieldKey: `pre_check/confirm_${index + 1}`, options: ["是", "否"] }]),
        ]),
        [
          textCell(`1.${items.length + 2} 实验环境`, { bold: true, align: "left" }),
          partCell([{ type: "radio", fieldKey: "pre_check/env", options: envOptions }]),
        ],
        [textCell("2 实验项目", { colspan: 2, bold: true, align: "left" })],
      ],
    },
  ];
}
