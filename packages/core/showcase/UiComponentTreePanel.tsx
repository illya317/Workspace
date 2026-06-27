import {
  EmptyStateCard,
  PanelCard,
} from "@workspace/core/ui";
import {
  coreUiComponentOwnerL1Meta,
  coreUiComponentOwnerL2Meta,
  coreUiComponentRoleMeta,
  type CoreUiComponentOwnerL1,
  type CoreUiComponentOwnerL2,
  type CoreUiComponentRole,
} from "@workspace/core/ui/component-registry";
import type { CoreUiComponentTreeNode } from "@workspace/core/ui/component-registry-view";
import { UiComponentTreeComponentRow } from "./UiComponentTreeComponentRow";

export type UiComponentTreeMetaKey =
  | "kind"
  | "usedBy"
  | "files"
  | "verified";

const OWNER_L1_ORDER = ["page", "data", "form", "common", "feedback"] as const;
const OWNER_L2_ORDER = Object.keys(coreUiComponentOwnerL2Meta);
const ROLE_ORDER = ["entry", "contract", "renderer", "primitive", "foundation", "private"] as const;

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

function groupNodesByOwner(nodes: readonly CoreUiComponentTreeNode[]) {
  const l1Groups = new Map<CoreUiComponentOwnerL1, Map<CoreUiComponentOwnerL2, CoreUiComponentTreeNode[]>>();
  for (const node of nodes) {
    const ownerL1 = node.component.ownerL1 ?? "common";
    const ownerL2 = node.component.ownerL2 ?? "common.foundation";
    const l2Groups = l1Groups.get(ownerL1) ?? new Map<CoreUiComponentOwnerL2, CoreUiComponentTreeNode[]>();
    const groupNodes = l2Groups.get(ownerL2) ?? [];
    groupNodes.push(node);
    l2Groups.set(ownerL2, groupNodes);
    l1Groups.set(ownerL1, l2Groups);
  }

  return [...l1Groups.entries()]
    .sort(([left], [right]) => compareByOrder(left, right, OWNER_L1_ORDER))
    .map(([ownerL1, l2Groups]) => ({
      ownerL1,
      ownerL2Groups: [...l2Groups.entries()]
        .sort(([left], [right]) => compareByOrder(left, right, OWNER_L2_ORDER))
        .map(([ownerL2, groupNodes]) => ({
          ownerL2,
          nodes: groupNodes.sort((left, right) => {
            const roleOrder = compareByOrder(
              left.component.role ?? "private",
              right.component.role ?? "private",
              ROLE_ORDER,
            );
            if (roleOrder !== 0) return roleOrder;
            return left.name.localeCompare(right.name);
          }),
        })),
    }));
}

function countL1Components(l1Group: ReturnType<typeof groupNodesByOwner>[number]) {
  return l1Group.ownerL2Groups.reduce((total, l2Group) => total + l2Group.nodes.length, 0);
}

function countRoles(nodes: readonly CoreUiComponentTreeNode[]) {
  return nodes.reduce<Record<CoreUiComponentRole | "unknown", number>>((counts, node) => {
    const role = node.component.role ?? "unknown";
    counts[role] = (counts[role] ?? 0) + 1;
    return counts;
  }, {} as Record<CoreUiComponentRole | "unknown", number>);
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
  const ownerGroups = groupNodesByOwner(nodes);
  return (
    <PanelCard
      title="L1/L2/L3 归属目录"
      bodyClassName="max-h-[calc(100vh-12rem)] overflow-y-auto p-3"
    >
      {nodes.length === 0 ? (
        <EmptyStateCard compact>没有找到匹配的注册项</EmptyStateCard>
      ) : (
        <div className="space-y-3">
          {ownerGroups.map((l1Group) => (
            <section key={l1Group.ownerL1} className="rounded-md border border-slate-200 bg-slate-50/50">
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      L1
                    </span>
                    {coreUiComponentOwnerL1Meta[l1Group.ownerL1].label}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500">
                    {coreUiComponentOwnerL1Meta[l1Group.ownerL1].description}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 shadow-sm">
                  {countL1Components(l1Group)}
                </span>
              </div>
              <div className="space-y-3 p-2">
                {l1Group.ownerL2Groups.map((l2Group) => {
                  const roleCounts = countRoles(l2Group.nodes);
                  return (
                    <div key={l2Group.ownerL2} className="rounded-md border border-slate-200 bg-white">
                      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-2.5 py-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                            <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                              L2
                            </span>
                            {coreUiComponentOwnerL2Meta[l2Group.ownerL2].label}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-400">
                            {l2Group.ownerL2}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                            {l2Group.nodes.length}
                          </span>
                          {ROLE_ORDER.map((role) => roleCounts[role] ? (
                            <span
                              key={role}
                              className="rounded-full bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500"
                              title={coreUiComponentRoleMeta[role].description}
                            >
                              {coreUiComponentRoleMeta[role].label} {roleCounts[role]}
                            </span>
                          ) : null)}
                        </div>
                      </div>
                      <div className="space-y-2 p-2">
                        {l2Group.nodes.map((node) => (
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
                  );
                })}
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
