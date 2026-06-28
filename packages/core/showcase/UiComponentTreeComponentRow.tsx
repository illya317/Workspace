import { ActionGlyph } from "@workspace/core/ui";
import type { CoreUiComponentTreeNode } from "@workspace/core/ui/component-registry-view";

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

function buildMeta(node: CoreUiComponentTreeNode, visibleMeta: readonly string[]) {
  const parts: string[] = [];
  if (visibleMeta.includes("usedBy")) parts.push(`被引用 ${node.usedByCount}`);
  if (visibleMeta.includes("files")) parts.push(`文件 ${node.usageFileCount}`);
  return parts.join(" · ");
}

function exposureBadge(component: CoreUiComponentTreeNode["component"]) {
  const exposure = component.exposure;
  if (component.role === "surface") {
    return {
      label: "声明接口",
      detail: exposure?.mode === "spec" ? `通过 ${exposure.entry}.${exposure.path} 声明` : "Surface 声明接口",
      classes: "bg-emerald-50 text-emerald-700",
    };
  }
  if (component.role === "host") {
    return {
      label: "宿主入口",
      detail: "执行 Surface 声明的宿主入口",
      classes: "bg-sky-50 text-sky-700",
    };
  }
  if (component.role === "helper") {
    return {
      label: "声明助手",
      detail: "构造 Surface 声明的 helper",
      classes: "bg-cyan-50 text-cyan-700",
    };
  }
  if (component.role === "service") {
    return {
      label: "服务接口",
      detail: "非视觉服务接口",
      classes: "bg-violet-50 text-violet-700",
    };
  }
  return {
    label: "内部实现",
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
  const isFoundation = node.component.subcategory === "common.foundation";
  const meta = buildMeta(node, visibleMeta);
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
            <span className={joinClassNames("min-w-0 flex-1 truncate text-sm font-semibold", isFoundation ? "text-slate-500" : "text-slate-900")}>
              {node.name}
            </span>
            <ActionGlyph
              kind="verified"
              className={`h-4 w-4 shrink-0 ${node.verified ? "text-emerald-600" : "text-amber-500"}`}
            />
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
                内部使用
              </p>
              <div className="flex flex-wrap gap-1.5">
                {node.children.map((child) => (
                  <button
                    key={child.path.join(">")}
                    type="button"
                    onClick={() => onSelect(child.name)}
                    title={child.component.description}
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
