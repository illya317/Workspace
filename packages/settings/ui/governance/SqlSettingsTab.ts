"use client";

import { workspacePath } from "@workspace/core/routing";
import {
  createMasterDetailBody,
  createMessageSection,
  createMetricsSection,
  createPageBody,
  createPageTableSection,
  createPanelSection,
  createStatusSection,
  type BodySurfaceProps,
  type DataSurfaceColumnSpec,
} from "@workspace/core/ui";
import { useEffect, useMemo, useState } from "react";

import {
  SQL_SETTINGS_DESKTOP_RATIO,
  type SqlSettingCatalogGroup,
  type SqlSettingCatalogItem,
  type SqlSettingGroupKey,
  type SqlSettingsCatalog,
} from "../../sql-settings-contract";

interface UseSqlSettingsTabInput {
  enabled: boolean;
  showToast: (message: string, type?: "success" | "error") => void;
}

const STATUS_VIEW = {
  aligned: { label: "已核对", tone: "emerald" as const },
  review: { label: "需确认", tone: "amber" as const },
  informational: { label: "信息", tone: "slate" as const },
};

const SOURCE_LABELS: Record<string, string> = {
  "configuration file": "配置文件",
  "command line": "启动参数",
  "environment variable": "环境变量",
  database: "数据库设置",
  user: "角色设置",
  session: "会话覆盖",
  default: "系统默认",
  override: "内部覆盖",
  "least-privilege": "最小权限边界",
  unknown: "未知",
};

const CONTEXT_LABELS: Record<string, string> = {
  internal: "内部固定",
  postmaster: "重启后",
  sighup: "重载后",
  backend: "新连接后",
  superuser: "管理员会话",
  user: "角色或会话",
  unknown: "未知",
};

function currentValue(item: SqlSettingCatalogItem) {
  const translated = item.currentValue === "on"
    ? "开启"
    : item.currentValue === "off"
      ? "关闭"
      : item.currentValue;
  return item.unit ? `${translated} ${item.unit}` : translated;
}

function sourceAndEffect(item: SqlSettingCatalogItem) {
  return [SOURCE_LABELS[item.source] ?? item.source, CONTEXT_LABELS[item.context] ?? item.context]
    .filter(Boolean)
    .join(" · ");
}

const SQL_SETTING_COLUMNS: DataSurfaceColumnSpec<SqlSettingCatalogItem>[] = [
  {
    key: "setting",
    label: "配置项",
    width: "xl",
    wrap: "wrap",
    cell: (item) => ({
      kind: "group",
      direction: "column",
      items: [
        { kind: "text", value: item.label, emphasis: "medium" },
        { kind: "text", value: item.key, font: "mono", tone: "muted" },
        { kind: "text", value: item.description, tone: "muted" },
      ],
    }),
  },
  {
    key: "currentValue",
    label: "当前值",
    width: "lg",
    cell: (item) => ({
      kind: "group",
      direction: "column",
      items: [
        { kind: "text", value: currentValue(item), font: "mono", emphasis: "medium" },
        ...(item.pendingRestart ? [{ kind: "badge" as const, label: "待重启", tone: "amber" as const }] : []),
      ],
    }),
  },
  {
    key: "recommendedValue",
    label: "建议值",
    width: "lg",
    wrap: "wrap",
    cell: (item) => ({ kind: "text", value: item.recommendedValue }),
  },
  {
    key: "source",
    label: "来源与生效",
    width: "lg",
    wrap: "wrap",
    cell: (item) => ({ kind: "text", value: sourceAndEffect(item), tone: "muted" }),
  },
  {
    key: "status",
    label: "状态",
    width: "sm",
    cell: (item) => ({ kind: "badge", ...STATUS_VIEW[item.status] }),
  },
];

function catalogFromPayload(payload: unknown): SqlSettingsCatalog {
  if (
    !payload
    || typeof payload !== "object"
    || !("groups" in payload)
    || !Array.isArray(payload.groups)
    || !("transport" in payload)
    || !payload.transport
    || typeof payload.transport !== "object"
  ) {
    throw new Error("SQL 设置响应格式无效");
  }
  return payload as SqlSettingsCatalog;
}

function groupReviewCount(group: SqlSettingCatalogGroup) {
  return group.items.filter((item) => item.status === "review").length;
}

export function useSqlSettingsTab({ enabled, showToast }: UseSqlSettingsTabInput): BodySurfaceProps {
  const [catalog, setCatalog] = useState<SqlSettingsCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedGroupKey, setSelectedGroupKey] = useState<SqlSettingGroupKey>("connection");
  const [mobileDetailActive, setMobileDetailActive] = useState(false);

  useEffect(() => {
    if (!enabled || catalog) return undefined;
    const controller = new AbortController();
    setLoading(true);
    void fetch(workspacePath("/api/settings/governance/sql-settings"), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`加载 SQL 设置失败 (${response.status})`);
        const nextCatalog = catalogFromPayload(await response.json());
        setCatalog(nextCatalog);
        setSelectedGroupKey(nextCatalog.groups[0]?.key ?? "connection");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        showToast(error instanceof Error ? error.message : "加载 SQL 设置失败", "error");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [catalog, enabled, showToast]);

  return useMemo(() => {
    if (!catalog) {
      return createPageBody([createStatusSection("sql-settings-status", {
        kind: loading ? "loading" : "empty",
        content: loading ? "正在读取 SQL 设置" : "暂无 SQL 设置",
      })]);
    }

    const selectedGroup = catalog.groups.find((group) => group.key === selectedGroupKey)
      ?? catalog.groups[0]
      ?? null;
    if (!selectedGroup) {
      return createPageBody([createStatusSection("sql-settings-empty", {
        kind: "empty",
        content: "暂无 SQL 设置",
      })]);
    }

    return createMasterDetailBody({
      master: {
        label: "SQL 设置",
        presentation: "compact",
        body: {
          kind: "selector",
          selector: {
            kind: "list",
            title: "设置",
            selectedId: selectedGroup.key,
            items: catalog.groups.map((group) => {
              const reviewCount = groupReviewCount(group);
              return {
                key: group.key,
                value: group,
                card: {
                  title: group.label,
                  subtitle: group.description,
                  trailing: `${group.items.length} 项`,
                  status: reviewCount > 0
                    ? { label: `${reviewCount} 项需确认`, tone: "warning" as const }
                    : { label: "已核对", tone: "success" as const },
                  tone: reviewCount > 0 ? "amber" as const : "emerald" as const,
                },
              };
            }),
            onSelect: (group: SqlSettingCatalogGroup) => {
              setSelectedGroupKey(group.key);
              setMobileDetailActive(true);
            },
          },
        },
      },
      detail: createPageBody([
        createMetricsSection("sql-settings-identity", {
          metrics: [
            { key: "database", label: "数据库", value: catalog.databaseName },
            { key: "role", label: "当前角色", value: catalog.roleName },
            { key: "version", label: "PostgreSQL", value: catalog.serverVersion },
            {
              key: "transport",
              label: "当前连接",
              value: catalog.transport.ssl
                ? [catalog.transport.protocol, catalog.transport.cipher].filter(Boolean).join(" · ") || "TLS"
                : "未使用 TLS",
            },
          ],
        }),
        createMessageSection("sql-settings-boundary", {
          content: "此处只读展示当前数据库的安全配置。修改必须通过受控运维流程完成，不向应用运行账号授予数据库管理权限。",
          tone: "default",
        }),
        createPanelSection("sql-settings-options", {
          title: selectedGroup.label,
          sections: [
            createMessageSection("sql-settings-group-description", {
              content: selectedGroup.description,
              tone: "muted",
            }),
            createPageTableSection("sql-settings-table", {
              rows: selectedGroup.items,
              columns: SQL_SETTING_COLUMNS,
              rowKey: (item) => item.key,
              emptyText: "当前分类暂无配置项",
              presentation: { density: "compact", cellWrap: "wrap", rowHover: "neutral" },
            }),
          ],
        }),
      ]),
      desktop: { ratio: SQL_SETTINGS_DESKTOP_RATIO },
      mobile: {
        detailActive: mobileDetailActive,
        onNavigateToList: () => setMobileDetailActive(false),
      },
    });
  }, [catalog, loading, mobileDetailActive, selectedGroupKey]);
}
