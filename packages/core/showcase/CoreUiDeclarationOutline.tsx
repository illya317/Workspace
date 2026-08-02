import React from "react";
import type { CoreUiCapabilityDescriptor } from "../ui/registry/component-registry";

export function CoreUiDeclarationOutline({
  items,
}: {
  items: readonly CoreUiCapabilityDescriptor[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold tracking-wide text-slate-500">
        声明结构
      </div>
      <div aria-label="声明结构" role="tree">
        <DeclarationLevel items={items} depth={0} />
      </div>
    </div>
  );
}

function DeclarationLevel({
  items,
  depth,
}: {
  items: readonly CoreUiCapabilityDescriptor[];
  depth: number;
}) {
  return (
    <div className={depth === 0 ? "divide-y divide-slate-200" : "ms-4 border-s border-slate-200"} role={depth === 0 ? undefined : "group"}>
      {items.map((item) => (
        <div key={`${depth}:${item.name}`} aria-level={depth + 1} aria-selected="false" role="treeitem">
          <div className={depth === 0
            ? "grid gap-1 bg-slate-50/40 px-4 py-3 sm:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)] sm:gap-5"
            : "grid gap-1 border-t border-slate-100 px-4 py-2.5 first:border-t-0 sm:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)] sm:gap-5"}
          >
            <div className={depth === 0 ? "font-semibold text-slate-900" : "font-mono text-[13px] font-medium text-slate-700"}>
              {item.name}
            </div>
            <div className="text-sm leading-6 text-slate-600">{item.description}</div>
          </div>
          {item.children?.length ? <DeclarationLevel items={item.children} depth={depth + 1} /> : null}
        </div>
      ))}
    </div>
  );
}
