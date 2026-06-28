import {
  EmptyStateCard,
  PanelCard,
} from "@workspace/core/ui";
import {
  coreUiComponentCategoryMeta,
  coreUiComponentSubcategoryMeta,
  type CoreUiComponentCategory,
  type CoreUiComponentSubcategory,
} from "@workspace/core/ui/component-registry";
import type { CoreUiComponentTreeNode } from "@workspace/core/ui/component-registry-view";
import { UiComponentTreeComponentRow } from "./UiComponentTreeComponentRow";

export type UiComponentTreeMetaKey =
  | "usedBy"
  | "files"
  | "verified";

const CATEGORY_ORDER = ["page", "data", "form", "common", "feedback"] as const;
const SUBCATEGORY_ORDER = Object.keys(coreUiComponentSubcategoryMeta);

function nodeId(name: string) {
  return `ui-component-root-${name}`;
}

function compareByOrder<T extends string>(
  left: T,
  right: T,
  order: readonly string[],
) {
  const leftIndex = order.indexOf(left);
  const rightIndex = order.indexOf(right);
  if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
  if (leftIndex === -1) return 1;
  if (rightIndex === -1) return -1;
  return leftIndex - rightIndex;
}

function groupNodesByCategory(nodes: readonly CoreUiComponentTreeNode[]) {
  const categoryGroups = new Map<CoreUiComponentCategory, Map<CoreUiComponentSubcategory, CoreUiComponentTreeNode[]>>();
  for (const node of nodes) {
    const category = node.component.category ?? "common";
    const subcategory = node.component.subcategory ?? "common.foundation";
    const subcategoryGroups = categoryGroups.get(category) ?? new Map<CoreUiComponentSubcategory, CoreUiComponentTreeNode[]>();
    const groupNodes = subcategoryGroups.get(subcategory) ?? [];
    groupNodes.push(node);
    subcategoryGroups.set(subcategory, groupNodes);
    categoryGroups.set(category, subcategoryGroups);
  }

  return [...categoryGroups.entries()]
    .sort(([left], [right]) => compareByOrder(left, right, CATEGORY_ORDER))
    .map(([category, subcategoryGroups]) => ({
      category,
      subcategoryGroups: [...subcategoryGroups.entries()]
        .sort(([left], [right]) => compareByOrder(left, right, SUBCATEGORY_ORDER))
        .map(([subcategory, groupNodes]) => ({
          subcategory,
          nodes: groupNodes.sort((left, right) => left.name.localeCompare(right.name)),
        })),
    }));
}

function countCategoryComponents(categoryGroup: ReturnType<typeof groupNodesByCategory>[number]) {
  return categoryGroup.subcategoryGroups.reduce((total, subcategoryGroup) => total + subcategoryGroup.nodes.length, 0);
}

export function UiComponentTreePanel({
  nodes,
  selectedName,
  expandedNames,
  visibleMeta,
  onSelect,
  onToggle,
}: {
  nodes: CoreUiComponentTreeNode[];
  selectedName: string | null;
  expandedNames: ReadonlySet<string>;
  visibleMeta: readonly string[];
  onSelect: (name: string) => void;
  onToggle: (name: string) => void;
}) {
  const categoryGroups = groupNodesByCategory(nodes);
  return (
    <PanelCard
      title="核心UI分类"
      bodyClassName="max-h-[calc(100vh-12rem)] overflow-y-auto p-3"
    >
      {nodes.length === 0 ? (
        <EmptyStateCard compact>没有找到匹配的注册项</EmptyStateCard>
      ) : (
        <div className="space-y-3">
          {categoryGroups.map((categoryGroup) => (
            <section key={categoryGroup.category} className="rounded-md border border-slate-200 bg-slate-50/50">
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      一级分类
                    </span>
                    {coreUiComponentCategoryMeta[categoryGroup.category].label}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500">
                    {coreUiComponentCategoryMeta[categoryGroup.category].description}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 shadow-sm">
                  {countCategoryComponents(categoryGroup)}
                </span>
              </div>
              <div className="space-y-3 p-2">
                {categoryGroup.subcategoryGroups.map((subcategoryGroup) => (
                    <div key={subcategoryGroup.subcategory} className="rounded-md border border-slate-200 bg-white">
                      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-2.5 py-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                            <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                              二级分类
                            </span>
                            {coreUiComponentSubcategoryMeta[subcategoryGroup.subcategory].label}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-400">
                            {subcategoryGroup.subcategory}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                            {subcategoryGroup.nodes.length}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2 p-2">
                        {subcategoryGroup.nodes.map((node) => (
                        <UiComponentTreeComponentRow
                          key={node.name}
                          node={node}
                          selectedName={selectedName}
                          expandedNames={expandedNames}
                          visibleMeta={visibleMeta}
                          onSelect={onSelect}
                          onToggle={onToggle}
                        />
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </PanelCard>
  );
}

export function getUiComponentTreeRootId(name: string) {
  return nodeId(name);
}
