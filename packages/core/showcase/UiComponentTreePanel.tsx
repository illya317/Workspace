import { EmptyStateCard, PanelCard } from "./internal-ui";
import {
  coreUiDeclarationCategoryMeta,
  type CoreUiDeclarationCategory,
} from "../ui/registry/component-registry";
import type { CoreUiComponentTreeNode } from "../ui/registry/component-registry-view";
import { UiComponentTreeComponentRow } from "./UiComponentTreeComponentRow";

const CATEGORY_ORDER: CoreUiDeclarationCategory[] = ["page-layout", "page-content", "common"];

function groupNodesByCategory(nodes: readonly CoreUiComponentTreeNode[]) {
  const groups = new Map<CoreUiDeclarationCategory, CoreUiComponentTreeNode[]>();
  for (const node of nodes) {
    const groupNodes = groups.get(node.category) ?? [];
    groupNodes.push(node);
    groups.set(node.category, groupNodes);
  }

  return CATEGORY_ORDER
    .map((category) => ({
      category,
      nodes: (groups.get(category) ?? []).sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .filter((group) => group.nodes.length > 0);
}

export function UiComponentTreePanel({
  nodes,
  selectedName,
  onSelect,
}: {
  nodes: CoreUiComponentTreeNode[];
  selectedName: string | null;
  onSelect: (name: string) => void;
}) {
  const categoryGroups = groupNodesByCategory(nodes);

  return (
    <PanelCard
      title="声明能力"
      bodyClassName="max-h-[calc(100vh-12rem)] overflow-y-auto p-3"
    >
      {nodes.length === 0 ? (
        <EmptyStateCard compact>没有找到匹配的声明能力</EmptyStateCard>
      ) : (
        <div className="space-y-3">
          {categoryGroups.map((categoryGroup) => {
            const meta = coreUiDeclarationCategoryMeta[categoryGroup.category];
            return (
              <section key={categoryGroup.category} className="rounded-md border border-slate-200 bg-slate-50/60">
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950">
                      {meta.label}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500">
                      {meta.description}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 shadow-sm">
                    {categoryGroup.nodes.length}
                  </span>
                </div>
                <div className="space-y-2 p-2">
                  {categoryGroup.nodes.map((node) => (
                    <UiComponentTreeComponentRow
                      key={node.name}
                      node={node}
                      selectedName={selectedName}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </PanelCard>
  );
}
