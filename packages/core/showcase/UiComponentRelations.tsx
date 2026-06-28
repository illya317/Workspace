"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PanelCard } from "./internal-ui";
import {
  type CoreUiCapabilityDescriptor,
  coreUiComponentSubcategoryMeta,
  type CoreUiComponentRegistration,
} from "@workspace/core/ui/component-registry";
import type { CoreUiComponentRelationView } from "@workspace/core/ui/component-registry-view";

const RELATION_LIMIT = 6;

function RelationItemButton({
  component,
  onSelect,
}: {
  component: CoreUiComponentRegistration;
  onSelect: (name: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(component.name)}
      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-left text-xs font-medium text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
    >
      {component.name}
    </button>
  );
}

function LimitedList({
  items,
  expanded,
  onToggle,
  renderItem,
  emptyText = "暂无",
}: {
  items: readonly CoreUiComponentRegistration[];
  expanded: boolean;
  onToggle: () => void;
  renderItem: (item: CoreUiComponentRegistration) => ReactNode;
  emptyText?: string;
}) {
  if (!items.length) return <p className="text-sm text-slate-400">{emptyText}</p>;
  const visibleItems = expanded ? items : items.slice(0, RELATION_LIMIT);
  const hiddenCount = items.length - visibleItems.length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {visibleItems.map((item) => <span key={item.name}>{renderItem(item)}</span>)}
      </div>
      {hiddenCount > 0 && (
        <button type="button" onClick={onToggle} className="text-xs font-medium text-emerald-700 hover:text-emerald-800">
          展开 {hiddenCount} 个
        </button>
      )}
      {expanded && items.length > RELATION_LIMIT && (
        <button type="button" onClick={onToggle} className="text-xs font-medium text-slate-500 hover:text-slate-700">
          收起
        </button>
      )}
    </div>
  );
}

function RelationBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-slate-100 bg-slate-50/60 p-3">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function DeclarativeCapabilitiesBlock({
  relation,
}: {
  relation: CoreUiComponentRelationView;
}) {
  const capabilities = relation.component.role === "surface"
    ? relation.component.declares ?? []
    : relation.component.capabilities ?? [];
  if (!capabilities.length) return <p className="text-sm text-slate-400">暂无</p>;

  return <DeclarationTree items={capabilities} />;
}

function DeclarationTree({
  items,
  depth = 0,
}: {
  items: readonly CoreUiCapabilityDescriptor[];
  depth?: number;
}) {
  return (
    <div className={depth === 0 ? "space-y-2" : "ml-3 mt-2 space-y-2 border-l border-slate-100 pl-3"}>
      {items.map((item) => (
        <div key={`${depth}-${item.name}`} className="min-w-0">
          <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
            <p className="text-xs font-semibold text-slate-800">{item.name}</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">{item.description}</p>
          </div>
          {item.children?.length ? <DeclarationTree items={item.children} depth={depth + 1} /> : null}
        </div>
      ))}
    </div>
  );
}

function ComposesBlock({
  relation,
  expandedGroups,
  toggleGroup,
  onSelect,
}: {
  relation: CoreUiComponentRelationView;
  expandedGroups: ReadonlySet<string>;
  toggleGroup: (key: string) => void;
  onSelect: (name: string) => void;
}) {
  if (!relation.composes.length) {
    return <p className="text-sm text-slate-400">暂无内部使用</p>;
  }

  return (
    <LimitedList
      items={relation.composes}
      expanded={expandedGroups.has("capabilities:composes")}
      onToggle={() => toggleGroup("capabilities:composes")}
      renderItem={(component) => <RelationItemButton component={component} onSelect={onSelect} />}
    />
  );
}

function UsedByBlock({
  relation,
  expandedGroups,
  toggleGroup,
  onSelect,
}: {
  relation: CoreUiComponentRelationView;
  expandedGroups: ReadonlySet<string>;
  toggleGroup: (key: string) => void;
  onSelect: (name: string) => void;
}) {
  if (!relation.usedByGrouped.length) return <p className="text-sm text-slate-400">暂无直接被引用</p>;

  return (
    <div className="space-y-3">
      {relation.usedByGrouped.map((group) => {
        const groupKey = `usedBy:${group.subcategory}`;
        return (
          <div key={groupKey}>
            <p className="mb-1 text-xs font-medium text-slate-400">
              {coreUiComponentSubcategoryMeta[group.subcategory].label}
            </p>
            <LimitedList
              items={group.components}
              expanded={expandedGroups.has(groupKey)}
              onToggle={() => toggleGroup(groupKey)}
              renderItem={(component) => <RelationItemButton component={component} onSelect={onSelect} />}
            />
          </div>
        );
      })}
    </div>
  );
}

function UsageFilesBlock({
  relation,
  expandedGroups,
  toggleGroup,
}: {
  relation: CoreUiComponentRelationView;
  expandedGroups: ReadonlySet<string>;
  toggleGroup: (key: string) => void;
}) {
  if (!relation.usageFilesGrouped.length) return <p className="text-sm text-slate-400">暂无文件引用数据</p>;

  return (
    <div className="space-y-3">
      {relation.usageFilesGrouped.map((group) => {
        const groupKey = `usage:${group.group}`;
        const expanded = expandedGroups.has(groupKey);
        const visibleFiles = expanded ? group.files : group.files.slice(0, RELATION_LIMIT);
        const hiddenCount = group.files.length - visibleFiles.length;
        return (
          <div key={group.group}>
            <p className="mb-1 text-xs font-medium text-slate-400">{group.group} · {group.files.length}</p>
            <div className="space-y-1">
              {visibleFiles.map((file) => (
                <code key={file} className="block truncate rounded bg-white px-2 py-1 text-xs text-slate-600" title={file}>
                  {file}
                </code>
              ))}
            </div>
            {hiddenCount > 0 && (
              <button type="button" onClick={() => toggleGroup(groupKey)} className="mt-2 text-xs font-medium text-emerald-700 hover:text-emerald-800">
                展开 {hiddenCount} 个
              </button>
            )}
            {expanded && group.files.length > RELATION_LIMIT && (
              <button type="button" onClick={() => toggleGroup(groupKey)} className="mt-2 text-xs font-medium text-slate-500 hover:text-slate-700">
                收起
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function UiComponentRelationPanel({
  relation,
  onSelect,
}: {
  relation: CoreUiComponentRelationView;
  onSelect: (name: string) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpandedGroups(new Set());
  }, [relation.component.name]);

  function toggleSet(setter: (updater: (current: Set<string>) => Set<string>) => void, key: string) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <PanelCard title="关系" bodyClassName="space-y-3 p-4">
      <RelationBlock title={relation.component.role === "surface" ? "声明项 declares" : "能力 capabilities"}>
        <DeclarativeCapabilitiesBlock relation={relation} />
      </RelationBlock>
      <RelationBlock title="内部使用">
        <ComposesBlock relation={relation} expandedGroups={expandedGroups} toggleGroup={(key) => toggleSet(setExpandedGroups, key)} onSelect={onSelect} />
      </RelationBlock>
      <RelationBlock title="直接被引用">
        <UsedByBlock relation={relation} expandedGroups={expandedGroups} toggleGroup={(key) => toggleSet(setExpandedGroups, key)} onSelect={onSelect} />
      </RelationBlock>
      <RelationBlock title="文件引用">
        <UsageFilesBlock relation={relation} expandedGroups={expandedGroups} toggleGroup={(key) => toggleSet(setExpandedGroups, key)} />
      </RelationBlock>
    </PanelCard>
  );
}
