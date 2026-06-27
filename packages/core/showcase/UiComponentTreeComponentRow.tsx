import { ActionGlyph } from "@workspace/core/ui";
import {
  coreUiComponentKindMeta,
  coreUiComponentPublicUseMeta,
  coreUiComponentRoleMeta,
  coreUiFrameMaturityMeta,
} from "@workspace/core/ui/component-registry";
import {
  formatNestDepth,
  nestDepthBadgeClasses,
} from "@workspace/core/ui/component-nest-depth";
import type { CoreUiComponentTreeNode } from "@workspace/core/ui/component-registry-view";

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
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
    ? { label: "稳定", classes: "bg-emerald-100 text-emerald-700" }
    : maturity === "tbc"
      ? { label: "待定", classes: "bg-orange-100 text-orange-700" }
      : { label: "内部", classes: "bg-slate-200 text-slate-700" };
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
  if (visibleMeta.includes("usedBy")) parts.push(`被引用 ${node.usedByCount}`);
  if (visibleMeta.includes("files")) parts.push(`文件 ${node.usageFileCount}`);
  return parts.join(" · ");
}

export function UiComponentTreeComponentRow({
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
  const canShowChildren = node.children.length > 0;
  const isFrame = node.accessLayer === "page-frame";
  const roleLabel = node.component.role
    ? coreUiComponentRoleMeta[node.component.role].label
    : "Component";
  const publicUseLabel = node.component.publicUse
    ? coreUiComponentPublicUseMeta[node.component.publicUse].label
    : "Unowned";
  const meta = buildMeta(node, visibleMeta);

  return (
    <div
      className={joinClassNames(
        "rounded-md border bg-white shadow-sm transition",
        selectedName === node.name
          ? "border-emerald-300 bg-emerald-50/70"
          : "border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/30",
      )}
      id={`ui-component-root-${node.name}`}
    >
      <button
        type="button"
        onClick={() => onSelect(node.name)}
        className="flex w-full min-w-0 items-center gap-2 px-2.5 py-2 text-left"
      >
        <span
          aria-label={`${expanded ? "收起" : "展开"} ${node.name}`}
          onClick={(event) => {
            if (!canShowChildren) return;
            event.stopPropagation();
            onToggle(node.name);
          }}
          className={joinClassNames(
            "grid size-5 shrink-0 place-items-center rounded bg-slate-50 text-xs font-semibold text-slate-500 shadow-sm",
            canShowChildren ? "hover:bg-slate-100" : "invisible",
          )}
        >
          {expanded ? "⌄" : "›"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
              L3
            </span>
            <span className={joinClassNames("min-w-0 flex-1 truncate text-sm font-semibold", node.accessLayer === "foundation" ? "text-slate-500" : "text-slate-900")}>
              {node.name}
            </span>
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
            <span
              className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
              title="L3 组件/角色层"
            >
              {roleLabel}
            </span>
            {visibleMeta.includes("verified") && <VerifiedBadge verified={node.verified} />}
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {publicUseLabel}{meta ? ` · ${meta}` : ""}
          </span>
        </span>
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-slate-100 px-3 py-2">
          <p className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
            {node.component.description}
          </p>
          {canShowChildren && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                组合依赖
              </p>
              <div className="flex flex-wrap gap-1.5">
                {node.children.map((child) => (
                  <button
                    key={child.path.join(">")}
                    type="button"
                    onClick={() => onSelect(child.name)}
                    className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                  >
                    {child.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
