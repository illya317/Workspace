import type {
  QcLayoutBlock,
  QcLayoutCell,
  QcTemplateTestItem,
  QcTemplatePrecheckFile,
  QcTemplatePrecheckItem,
} from "./types";
import { loadQcLayoutBlocks } from "./layout-blocks";

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

function precheckConfirmationBlocks(
  block: QcLayoutBlock,
  files: QcTemplatePrecheckFile[],
  items: QcTemplatePrecheckItem[],
  envOptions: string[],
) {
  const section = block.sectionSuffix || "1";
  const fileSection = block.fileSectionSuffix || `${section}.1`;
  const fileTitle = block.fileTitle || "文件";
  return [
    { type: "title", title: block.title || "检验前确认", sectionSuffix: section },
    {
      type: "table",
      label: "precheck-files",
      rows: [
        [textCell(`${fileSection} ${fileTitle}`, { colspan: 3, bold: true, align: "left" })],
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
          textCell(`${section}.${index + 2} ${item.name}`, { bold: true, align: "left" }),
          partCell([{ type: "radio", fieldKey: `pre_check/confirm_${index + 1}`, options: ["是", "否"] }]),
        ]),
        [
          textCell(`${section}.${items.length + 2} 实验环境`, { bold: true, align: "left" }),
          partCell([{ type: "radio", fieldKey: "pre_check/env", options: envOptions }]),
        ],
      ],
    },
  ];
}

export async function buildPrecheckLayoutBlocks(
  configRoot: string,
  productName: string,
  stageLabel: string,
  precheckInfo: Record<string, string>,
  files: QcTemplatePrecheckFile[],
  items: QcTemplatePrecheckItem[],
  environment: Record<string, unknown>,
  tests: QcTemplateTestItem[] = [],
): Promise<QcLayoutBlock[]> {
  const basis = basisText(precheckInfo, files);
  const environmentOptions = Object.entries(environment)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
  const envOptions = environmentOptions.length ? environmentOptions : ["符合要求", "不符合要求"];
  const precheckBlocks = await loadQcLayoutBlocks(configRoot, {
    key: "parents/precheck_full",
    templateId: "parents/precheck_full",
    status: "pilot",
    params: {
      stage_title: `${productName}${stageLabel}`,
      sample_name: precheckInfo["检品名称"] || `${productName}${stageLabel}`,
      packaging: precheckInfo["包装情况"] || "",
      purpose: precheckInfo["检验目的"] || "",
      sample_quantity: "",
      request_department: precheckInfo["请验部门"] || "",
      basis_text: basis,
    },
  }) ?? [];
  const experimentBlocks = await loadQcLayoutBlocks(configRoot, {
    key: "parents/experiment_projects_full",
    templateId: "parents/experiment_projects_full",
    status: "pilot",
    params: {
      tests: tests.map((test) => ({
        sequence: test.sequence,
        name: test.name,
        methodName: test.methodName,
        templateId: test.layout?.templateId || "",
      })),
    },
  }) ?? [];

  return [
    ...precheckBlocks.flatMap((block) => (
      block.type === "precheck_confirmation" ? precheckConfirmationBlocks(block, files, items, envOptions) : [block]
    )),
    ...experimentBlocks,
  ];
}
