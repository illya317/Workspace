const CATEGORY_LABELS: Record<string, string> = {
  assay: "含量/溶出成套",
  calculation: "计算",
  common: "通用",
  conclusion: "结论",
  general: "通用项目",
  identification: "鉴别",
  measurement: "测定",
  microbiology: "微生物",
  operation: "操作方法",
  precheck: "检验前确认",
  weighing: "称重",
};

const NAME_LABELS: Record<string, string> = {
  abnormal_handling: "实验结果异常处理",
  cleanup_checklist: "清场",
  conclusion: "结论",
  environment_table: "实验环境表",
  equipment_table: "仪器设备表",
  materials_table: "试验材料表",
  project_header_dates: "项目日期表头",
  raw_data_attachments: "原始数据上传",
  standard_text: "标准规定",
};

function hasChinese(value: string) {
  return /[\u3400-\u9fff]/.test(value);
}

export function qcTemplateCategoryLabel(category: string) {
  return CATEGORY_LABELS[category] || category;
}

export function qcTemplateDisplayName(id: string, title: string) {
  if (hasChinese(title)) return title;
  const name = id.split("/").pop() || id;
  return NAME_LABELS[name] || title || name.replace(/_/g, " ");
}
