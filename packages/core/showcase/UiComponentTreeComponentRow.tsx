import { ActionGlyph } from "@workspace/core/ui";
import {
  coreUiComponentKindMeta,
  coreUiFrameMaturityMeta,
} from "@workspace/core/ui/component-registry";
import type { CoreUiComponentTreeNode } from "@workspace/core/ui/component-registry-view";

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
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

function entryLevelBadgeClassName(level?: CoreUiComponentTreeNode["uiLevel"]) {
  if (level === 1) return "bg-emerald-100 text-emerald-800";
  if (level === 2) return "bg-sky-100 text-sky-700";
  if (level === 3) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

function entryLevelName(level?: CoreUiComponentTreeNode["uiLevel"]) {
  if (level === 1) return "页面";
  if (level === 2) return "能力";
  if (level === 3) return "实现";
  return "无入口";
}

function entryLevelBadge(
  node: CoreUiComponentTreeNode,
  uiLevelByName: ReadonlyMap<string, CoreUiComponentTreeNode["uiLevel"]>,
) {
  const exposure = node.component.agentExposure;
  if (exposure?.mode === "direct") {
    return {
      label: `${entryLevelName(node.uiLevel)}入口`,
      detail: "可直接调用",
      classes: entryLevelBadgeClassName(node.uiLevel),
    };
  }
  if (exposure?.mode === "via") {
    const entryLevel = uiLevelByName.get(exposure.entry);
    return {
      label: `封到${entryLevelName(entryLevel)}`,
      detail: `${exposure.entry}.${exposure.path}`,
      classes: entryLevelBadgeClassName(entryLevel),
    };
  }
  return {
    label: "无入口",
    detail: "内部实现",
    classes: entryLevelBadgeClassName(),
  };
}

function exposureBadge(component: CoreUiComponentTreeNode["component"]) {
  const exposure = component.agentExposure;
  if (exposure?.mode === "direct") {
    return {
      label: "调用",
      detail: "可直接调用",
      classes: "bg-emerald-50 text-emerald-700",
    };
  }
  if (exposure?.mode === "via") {
    return {
      label: "封装",
      detail: `${exposure.entry}.${exposure.path}`,
      classes: "bg-sky-50 text-sky-700",
    };
  }
  return {
    label: "内部",
    detail: "内部实现",
    classes: "bg-slate-50 text-slate-500",
  };
}

export function UiComponentTreeComponentRow({
  node,
  selectedName,
  expandedNames,
  visibleMeta,
  onSelect,
  onToggle,
  uiLevelByName,
}: {
  node: CoreUiComponentTreeNode;
  selectedName: string | null;
  expandedNames: ReadonlySet<string>;
  visibleMeta: readonly string[];
  onSelect: (name: string) => void;
  onToggle: (name: string) => void;
  uiLevelByName: ReadonlyMap<string, CoreUiComponentTreeNode["uiLevel"]>;
}) {
  const expanded = expandedNames.has(node.name);
  const canShowChildren = node.children.length > 0;
  const isFrame = node.accessLayer === "page-frame";
  const meta = buildMeta(node, visibleMeta);
  const entryLevel = entryLevelBadge(node, uiLevelByName);
  const exposure = exposureBadge(node.component);

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
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${entryLevel.classes}`}
              title={entryLevel.detail}
            >
              {entryLevel.label}
            </span>
            <span className={joinClassNames("min-w-0 flex-1 truncate text-sm font-semibold", node.accessLayer === "foundation" ? "text-slate-500" : "text-slate-900")}>
              {node.name}
            </span>
            <ActionGlyph
              kind="verified"
              className={`h-4 w-4 shrink-0 ${node.verified ? "text-emerald-600" : "text-amber-500"}`}
            />
            {isFrame && <FrameMaturityBadge maturity={node.component.frameMaturity} />}
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${exposure.classes}`}
              title={exposure.detail}
            >
              {exposure.label}
            </span>
          </span>
          {meta && (
            <span className="mt-0.5 block truncate text-xs text-slate-500">
              {meta}
            </span>
          )}
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
