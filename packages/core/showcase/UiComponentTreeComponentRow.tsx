import type { CoreUiComponentTreeNode } from "../ui/registry/component-registry-view";

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export function UiComponentTreeComponentRow({
  node,
  selectedName,
  onSelect,
}: {
  node: CoreUiComponentTreeNode;
  selectedName: string | null;
  onSelect: (name: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(node.name)}
      className={joinClassNames(
        "flex w-full min-w-0 flex-col rounded-md border px-3 py-2.5 text-left transition",
        selectedName === node.name
          ? "border-emerald-300 bg-emerald-50/80"
          : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40",
      )}
    >
      <span className="truncate text-sm font-semibold text-slate-950">
        {node.name}
      </span>
      <span className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
        {node.component.description}
      </span>
    </button>
  );
}
