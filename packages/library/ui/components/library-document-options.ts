export const LIBRARY_DOCUMENT_STATUS_FILTER_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "active", label: "正常" },
  { value: "missing", label: "缺失" },
  { value: "archived", label: "归档" },
  { value: "draft", label: "草稿" },
];

export const LIBRARY_DOCUMENT_STATUS_OPTIONS = LIBRARY_DOCUMENT_STATUS_FILTER_OPTIONS.slice(1);

export const LIBRARY_DOCUMENT_CONFIDENTIALITY_FILTER_OPTIONS = [
  { value: "", label: "全部保密等级" },
  { value: "0", label: "公开" },
  { value: "1", label: "内部" },
  { value: "2", label: "普通" },
  { value: "3", label: "机密" },
  { value: "4", label: "绝密" },
];

export const LIBRARY_DOCUMENT_CONFIDENTIALITY_OPTIONS = LIBRARY_DOCUMENT_CONFIDENTIALITY_FILTER_OPTIONS
  .slice(1)
  .map((option) => ({ value: Number(option.value), label: option.label }));

export const LIBRARY_DOCUMENT_CONFIDENTIALITY_FIELD_OPTIONS = LIBRARY_DOCUMENT_CONFIDENTIALITY_OPTIONS
  .map((option) => ({ value: String(option.value), label: option.label }));
