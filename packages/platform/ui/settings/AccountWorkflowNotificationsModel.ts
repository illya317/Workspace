export type WorkflowInboxPerspective = "received" | "originated";

export type WorkflowCategoryDto = {
  key: string;
  label: string;
  sortOrder: number;
};

type CategorizedWorkflowItem = {
  workflow: {
    categoryKey: string | null;
    categoryLabel: string | null;
  } | null;
};

export function groupWorkflowItems<T extends CategorizedWorkflowItem>(
  items: T[],
  categories: WorkflowCategoryDto[],
) {
  const categoryByKey = new Map(categories.map((category) => [category.key, category]));
  const groups = new Map<string, { key: string; label: string; sortOrder: number; items: T[] }>();
  for (const item of items) {
    const categoryKey = item.workflow?.categoryKey ?? "other";
    const registered = categoryByKey.get(categoryKey);
    const group = groups.get(categoryKey) ?? {
      key: categoryKey,
      label: registered?.label ?? item.workflow?.categoryLabel ?? "其他流程",
      sortOrder: registered?.sortOrder ?? Number.MAX_SAFE_INTEGER,
      items: [],
    };
    group.items.push(item);
    groups.set(categoryKey, group);
  }
  return Array.from(groups.values()).sort((left, right) => (
    left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, "zh-CN")
  ));
}

export function workflowPerspectiveEmptyText(perspective: WorkflowInboxPerspective) {
  return perspective === "received" ? "暂无收到的流程" : "暂无发起的流程";
}

export function workflowPerspectiveCountText(perspective: WorkflowInboxPerspective, count: number) {
  return `${count} 条${perspective === "received" ? "待处理" : "流程记录"}`;
}
