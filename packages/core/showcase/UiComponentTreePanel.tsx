import {
  ActionGlyph,
  EmptyStateCard,
  PanelCard,
} from "@workspace/core/ui";
import { TreeNodeBranch, TreeNodeCard } from "../ui/HierarchyTree";
import {
  coreUiComponentAccessLayerMeta,
  coreUiComponentKindMeta,
  coreUiFrameMaturityMeta,
} from "@workspace/core/ui/component-registry";
import {
  formatNestDepth,
  nestDepthBadgeClasses,
} from "@workspace/core/ui/component-nest-depth";
import type { CoreUiComponentTreeNode } from "@workspace/core/ui/component-registry-view";

export type UiComponentTreeMetaKey =
  | "kind"
  | "accessLayer"
  | "usedBy"
  | "files"
  | "verified";

function nodeId(name: string) {
  return `ui-component-root-${name}`;
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        verified ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
      }`}
      title={verified ? "当前不需要改" : "待进入改造队列"}
    >
      {verified ? "无需改造" : "待改造"}
    </span>
  );
}

function FrameMaturityBadge({ maturity }: { maturity?: string }) {
  if (!maturity) return null;
  const meta = maturity === "stable"
    ? { label: "Stable", classes: "bg-emerald-100 text-emerald-700" }
    : maturity === "tbc"
      ? { label: "TBC", classes: "bg-orange-100 text-orange-700" }
      : { label: "Internal", classes: "bg-slate-200 text-slate-700" };
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${meta.classes}`}
      title={coreUiFrameMaturityMeta[maturity as keyof typeof coreUiFrameMaturityMeta]?.description ?? ""}
    >
      {meta.label}
    </span>
  );
}

function buildMeta(node: CoreUiComponentTreeNode, visibleMeta: readonly string[]) {
  const parts: string[] = [];
  if (visibleMeta.includes("kind")) parts.push(coreUiComponentKindMeta[node.kind].label);
  if (visibleMeta.includes("accessLayer")) parts.push(coreUiComponentAccessLayerMeta[node.accessLayer].label);
  if (visibleMeta.includes("usedBy")) parts.push(`被引用 ${node.usedByCount}`);
  if (visibleMeta.includes("files")) parts.push(`文件 ${node.usageFileCount}`);
  return parts.join(" · ");
}

function TreeNodeView({
  node,
  selectedName,
  expandedNames,
  visibleMeta,
  onSelect,
  onToggle,
}: {
  node: CoreUiComponentTreeNode;
  selectedName: string | null;
  expandedNames: ReadonlySet<string>;
  visibleMeta: readonly string[];
  onSelect: (name: string) => void;
  onToggle: (name: string) => void;
}) {
  const expanded = expandedNames.has(node.name);
  const canShowChildren = node.depth < 3 && node.children.length > 0;
  const isFrame = node.accessLayer === "page-frame";

  return (
    <TreeNodeCard
      title={(
        <span className="flex items-center gap-2">
          <span className="truncate">{node.name}</span>
          <ActionGlyph
            kind="verified"
            className={`h-4 w-4 shrink-0 ${node.verified ? "text-emerald-600" : "text-amber-500"}`}
          />
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${nestDepthBadgeClasses(node.nestDepth)}`}
            title={`向下组合最大嵌套 ${node.nestDepth} 层`}
          >
            {formatNestDepth(node.nestDepth)}
          </span>
          {isFrame && <FrameMaturityBadge maturity={node.component.frameMaturity} />}
          {visibleMeta.includes("verified") && <VerifiedBadge verified={node.verified} />}
        </span>
      )}
      active={selectedName === node.name}
      meta={buildMeta(node, visibleMeta)}
      showToggle={canShowChildren}
      toggle={canShowChildren ? {
        enabled: true,
        expanded,
        label: `${expanded ? "收起" : "展开"}${node.name}`,
        onClick: () => onToggle(node.name),
      } : undefined}
      onClick={() => onSelect(node.name)}
      className="shadow-none"
      titleClassName={node.accessLayer === "foundation" ? "text-slate-500" : undefined}
    >
      {expanded && (
        <div className="space-y-2">
          {node.depth === 1 && (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
              {node.component.description}
            </p>
          )}
          {canShowChildren && (
            <TreeNodeBranch>
              {node.children.map((child) => (
                <TreeNodeView
                  key={child.path.join(">")}
                  node={child}
                  selectedName={selectedName}
                  expandedNames={expandedNames}
                  visibleMeta={visibleMeta}
                  onSelect={onSelect}
                  onToggle={onToggle}
                />
              ))}
            </TreeNodeBranch>
          )}
        </div>
      )}
    </TreeNodeCard>
  );
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
  return (
    <PanelCard title="组件目录" bodyClassName="max-h-[calc(100vh-12rem)] overflow-y-auto p-3">
      {nodes.length === 0 ? (
        <EmptyStateCard compact>没有找到匹配的注册项</EmptyStateCard>
      ) : (
        <div className="space-y-2">
          {nodes.map((node) => (
            <div key={node.name} id={nodeId(node.name)}>
              <TreeNodeView
                node={node}
                selectedName={selectedName}
                expandedNames={expandedNames}
                visibleMeta={visibleMeta}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  );
}

export function getUiComponentTreeRootId(name: string) {
  return nodeId(name);
}
