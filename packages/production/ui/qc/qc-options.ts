export const QC_BATCH_STATUS_OPTIONS = [{
  value: "all",
  label: "全部"
}, {
  value: "exception",
  label: "异常"
}, {
  value: "accepted",
  label: "已验收"
}, {
  value: "inspecting",
  label: "检验中"
}, {
  value: "reviewing",
  label: "待复核"
}];

export const QC_BATCH_PAGE_SIZE_OPTIONS = [20, 50, 100, 200].map(size => ({
  value: String(size),
  label: `${size}条/页`
}));
