import type {
  QcLayoutBlock,
  QcTemplatePrecheckFile,
  QcTemplatePrecheckItem,
} from "./types";
import { loadQcLayoutBlocks } from "./layout-blocks";

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
  return files.slice(0, 2).map(fileWithCodeText).filter(Boolean).join("、\n");
}

export async function buildPrecheckLayoutBlocks(
  configRoot: string,
  productName: string,
  stageLabel: string,
  precheckInfo: Record<string, string>,
  files: QcTemplatePrecheckFile[],
  items: QcTemplatePrecheckItem[],
  environment: Record<string, unknown>,
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
      precheck_files: files.map((file) => ({ name: fileNameText(file.name), code: file.code.trim() })),
      precheck_items: items.map((item) => ({ name: item.name.trim() })),
      precheck_env_options: envOptions,
    },
  }) ?? [];
  return precheckBlocks;
}
