import { asArray, asRecord, asString } from "./layout-block-utils";
import { standardCleanupItems } from "./editor-adapter-layout";

export function summarizeStandard(test: Record<string, unknown>) {
  if (typeof test["标准规定"] === "string") return test["标准规定"];
  const template = asString(test["标准规定模板"]);
  const params = asRecord(test["标准规定参数"]);
  if (!template) return undefined;
  if (template === "variation_difference_limit") {
    const basis = asString(params.basis, "平均片重");
    const limit = asString(params.limit, "7.0");
    const differenceName = asString(params.difference_name, "重量差异");
    const maxOver = asString(params.max_over, "2");
    const unit = asString(params.unit, "片");
    const oneUnit = asString(params.one_unit, `一${unit}`);
    return `差异限度应为${basis}的±${limit}%以内，如有超出${differenceName}限度的不得多于${maxOver}${unit}，并不得有${oneUnit}超出限度一倍。`;
  }
  if (template === "moisture_s_limit") return `水分不得过${asString(params.limit)}%。`;
  if (template === "appearance_description") return asString(params.description);
  if (template === "dissolution_release_limit") return `限度为标示量的${asString(params.limit)}%。`;
  if (template === "content_assay_range") {
    return `${asString(params.subject, "含量")}${asString(params.phrase, "应为")} ${asString(params.lower)}%～${asString(params.upper)}%。`;
  }
  const values = Object.entries(params).map(([key, value]) => `${key}=${String(value)}`);
  return values.length ? `${template} (${values.join(", ")})` : template;
}

export function cleanupItems(test: Record<string, unknown>) {
  const configured = asArray(test["清场项目"] || test["清场"])
    .map((item) => asString(asRecord(item)["名称"] || asRecord(item).text || item))
    .filter(Boolean);
  if (configured.length) return configured;
  if (asString(test["清场模板"]) === "standard_cleanup") {
    return standardCleanupItems();
  }
  return [];
}
