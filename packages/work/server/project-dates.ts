export type ProjectDateSource = {
  baselineStartDate: Date | null;
  baselineEndDate: Date | null;
  startDate: Date | null;
  endDate: Date | null;
};

export function deriveStatusFromActualDates(startDate: Date | null, endDate: Date | null) {
  if (endDate) return "已完成";
  if (startDate) return "进行中";
  return "未开始";
}

export function effectiveProjectDates(project: ProjectDateSource & { parentProjectTask?: ProjectDateSource | null }) {
  const source = project.parentProjectTask || project;
  return {
    baselineStartDate: source.baselineStartDate,
    baselineEndDate: source.baselineEndDate,
    startDate: source.startDate,
    endDate: source.endDate,
  };
}
