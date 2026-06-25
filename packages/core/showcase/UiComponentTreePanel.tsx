import {
  EmptyStateCard,
  PanelCard,
  TreeNodeBranch,
  TreeNodeCard,
} from "@workspace/core/ui";
import type { CoreUiRegistryTreeGroup } from "@workspace/core/ui/component-registry-view";

export function UiComponentTreePanel({
  groups,
  selectedName,
  onSelect,
}: {
  groups: CoreUiRegistryTreeGroup[];
  selectedName: string;
  onSelect: (name: string) => void;
}) {
  return (
    <PanelCard title="组件目录" bodyClassName="max-h-[calc(100vh-12rem)] overflow-y-auto p-3">
      {groups.length === 0 ? (
        <EmptyStateCard compact>没有找到匹配的注册项</EmptyStateCard>
      ) : (
        <div className="space-y-2">
          {groups.map((tierGroup) => {
            const tierCount = tierGroup.kinds.reduce((sum, kindGroup) => sum + kindGroup.nodes.length, 0);
            return (
              <TreeNodeCard
                key={tierGroup.tier}
                title={tierGroup.tierLabel}
                level={1}
                meta={`${tierCount} 个组件`}
                showToggle={false}
                className="shadow-none"
              >
                <TreeNodeBranch>
                  {tierGroup.kinds.map((kindGroup) => (
                    <TreeNodeCard
                      key={`${tierGroup.tier}:${kindGroup.kind}`}
                      title={kindGroup.kindLabel}
                      level={2}
                      meta={`${kindGroup.nodes.length} 个组件`}
                      showToggle={false}
                      className="shadow-none"
                    >
                      <TreeNodeBranch>
                        {kindGroup.nodes.map((node) => (
                          <TreeNodeCard
                            key={node.name}
                            title={node.name}
                            level={3}
                            active={selectedName === node.name}
                            meta={`被引用 ${node.directUsedByCount} · 文件 ${node.usageFileCount} · ${node.verified ? "已验证" : "未验证"}`}
                            showToggle={false}
                            onClick={() => onSelect(node.name)}
                            className="shadow-none"
                          />
                        ))}
                      </TreeNodeBranch>
                    </TreeNodeCard>
                  ))}
                </TreeNodeBranch>
              </TreeNodeCard>
            );
          })}
        </div>
      )}
    </PanelCard>
  );
}
