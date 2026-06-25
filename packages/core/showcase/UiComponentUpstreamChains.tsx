import { coreUiComponentRegistry, type CoreUiComponentRegistration } from "@workspace/core/ui";
import type { CoreUiComponentRelationView } from "@workspace/core/ui/component-registry-view";

function UpstreamChainNode({
  component,
  depth,
  expandedPathNames,
  togglePathName,
  onSelect,
  componentByName,
  usedByByName,
}: {
  component: CoreUiComponentRegistration;
  depth: number;
  expandedPathNames: ReadonlySet<string>;
  togglePathName: (name: string) => void;
  onSelect: (name: string) => void;
  componentByName: ReadonlyMap<string, CoreUiComponentRegistration>;
  usedByByName: ReadonlyMap<string, readonly string[]>;
}) {
  const childNames = usedByByName.get(component.name) ?? [];
  const expanded = expandedPathNames.has(component.name);
  const children = childNames
    .map((name) => componentByName.get(name))
    .filter((item): item is CoreUiComponentRegistration => Boolean(item));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSelect(component.name)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
        >
          {component.name}
        </button>
        {children.length > 0 && depth < 4 && (
          <button
            type="button"
            onClick={() => togglePathName(component.name)}
            className="text-xs font-medium text-slate-500 hover:text-emerald-700"
          >
            {expanded ? "收起" : `展开 ${children.length}`}
          </button>
        )}
      </div>
      {expanded && depth < 4 && children.length > 0 && (
        <div className="ml-3 border-l border-slate-200 pl-3">
          {children.map((child) => (
            <UpstreamChainNode
              key={`${component.name}:${child.name}`}
              component={child}
              depth={depth + 1}
              expandedPathNames={expandedPathNames}
              togglePathName={togglePathName}
              onSelect={onSelect}
              componentByName={componentByName}
              usedByByName={usedByByName}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function UiComponentUpstreamChains({
  relation,
  open,
  onToggleOpen,
  expandedPathNames,
  togglePathName,
  onSelect,
  usedByByName,
}: {
  relation: CoreUiComponentRelationView;
  open: boolean;
  onToggleOpen: () => void;
  expandedPathNames: ReadonlySet<string>;
  togglePathName: (name: string) => void;
  onSelect: (name: string) => void;
  usedByByName: ReadonlyMap<string, readonly string[]>;
}) {
  const componentByName = new Map<string, CoreUiComponentRegistration>(
    coreUiComponentRegistry.map((component) => [component.name, component as CoreUiComponentRegistration]),
  );
  const roots = relation.usedByGrouped.flatMap((group) => group.components);

  return (
    <div>
      <button
        type="button"
        onClick={onToggleOpen}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 hover:text-emerald-700"
      >
        <span>{open ? "收起向上链路" : "展开向上链路"}</span>
        <span className="text-xs text-slate-400">{roots.length}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {roots.length === 0 ? (
            <p className="text-sm text-slate-400">暂无上级链路</p>
          ) : (
            roots.map((root) => (
              <UpstreamChainNode
                key={root.name}
                component={root}
                depth={1}
                expandedPathNames={expandedPathNames}
                togglePathName={togglePathName}
                onSelect={onSelect}
                componentByName={componentByName}
                usedByByName={usedByByName}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
