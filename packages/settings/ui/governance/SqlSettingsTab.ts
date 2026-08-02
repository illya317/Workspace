"use client";

import { workspacePath } from "@workspace/core/routing";
import {
  createMasterDetailBody,
  createMessageSection,
  createPageBody,
  createPageTableSection,
  createPanelSection,
  createStatusSection,
  type BodySurfaceProps,
  type DataSurfaceColumnSpec,
} from "@workspace/core/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  SQL_SETTINGS_DESKTOP_RATIO,
  type SqlSettingCatalogGroup,
  type SqlSettingCatalogItem,
  type SqlSettingGroupKey,
  type SqlSettingOperation,
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

const MANAGEMENT_VIEW = {
  "runtime-setting": { label: "可修改", tone: "emerald" as const },
  "password-rotation": { label: "可轮换", tone: "amber" as const },
  "host-operation": { label: "宿主运维", tone: "slate" as const },
  "read-only": { label: "只读", tone: "slate" as const },
};

const OPERATION_STATUS_VIEW = {
  pending: { label: "等待执行", tone: "amber" as const },
  running: { label: "执行中", tone: "sky" as const },
  succeeded: { label: "已完成", tone: "emerald" as const },
  failed: { label: "失败", tone: "red" as const },
  reconciliation_required: { label: "需人工核对", tone: "red" as const },
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
  "controlled-secret": "受控凭据",
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
  "controlled-operation": "受控轮换",
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

function durationMilliseconds(value: string) {
  const match = /^(\d+)(ms|s|min)$/.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  return match[2] === "ms" ? amount : match[2] === "s" ? amount * 1_000 : amount * 60_000;
}

function initialOption(item: SqlSettingCatalogItem) {
  if (item.options.length === 0) return "";
  const currentMs = durationMilliseconds(`${item.currentValue}${item.unit ?? ""}`);
  return item.options.find((option) => durationMilliseconds(option.value) === currentMs)?.value
    ?? item.options[0]?.value
    ?? "";
}

function catalogFromPayload(payload: unknown): SqlSettingsCatalog {
  if (
    !payload
    || typeof payload !== "object"
    || !("groups" in payload)
    || !Array.isArray(payload.groups)
    || !("operations" in payload)
    || !Array.isArray(payload.operations)
    || !("transport" in payload)
    || !payload.transport
    || typeof payload.transport !== "object"
  ) {
    throw new Error("SQL 设置响应格式无效");
  }
  return payload as SqlSettingsCatalog;
}

async function fetchSqlSettingsCatalog(signal?: AbortSignal) {
  const response = await fetch(workspacePath("/api/settings/governance/sql-settings"), { signal });
  if (!response.ok) throw new Error(`加载 SQL 设置失败 (${response.status})`);
  return catalogFromPayload(await response.json());
}

async function responseError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return payload?.error || fallback;
}

function groupReviewCount(group: SqlSettingCatalogGroup) {
  return group.items.filter((item) => item.status === "review").length;
}

function activeOperationForItem(operations: SqlSettingOperation[], item: SqlSettingCatalogItem) {
  return operations.find((operation) => (
    (operation.status === "pending" || operation.status === "running")
    && (
      (item.managementMode === "password-rotation" && operation.operation === "rotate-runtime-password")
      || (item.managementMode === "runtime-setting" && operation.operation === "set-runtime-setting" && operation.settingKey === item.key)
    )
  ));
}

const OPERATION_COLUMNS: DataSurfaceColumnSpec<SqlSettingOperation>[] = [
  {
    key: "operation",
    label: "操作",
    width: "lg",
    cell: (operation) => ({
      kind: "text",
      value: operation.operation === "rotate-runtime-password"
        ? "轮换应用数据库密码"
        : `修改 ${operation.settingKey ?? "SQL 设置"}`,
      emphasis: "medium",
    }),
  },
  { key: "value", label: "目标值", width: "sm", cell: (operation) => ({ kind: "text", value: operation.requestedValue ?? "系统生成" }) },
  { key: "reason", label: "原因", width: "lg", wrap: "wrap", cell: (operation) => ({ kind: "text", value: operation.reason, tone: "muted" }) },
  { key: "status", label: "状态", width: "sm", cell: (operation) => ({ kind: "badge", ...OPERATION_STATUS_VIEW[operation.status] }) },
  { key: "message", label: "结果", width: "lg", wrap: "wrap", cell: (operation) => ({ kind: "text", value: operation.message ?? "—", tone: "muted" }) },
];

export function useSqlSettingsTab({ enabled, showToast }: UseSqlSettingsTabInput): BodySurfaceProps {
  const [catalog, setCatalog] = useState<SqlSettingsCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedGroupKey, setSelectedGroupKey] = useState<SqlSettingGroupKey>("credentials");
  const [mobileDetailActive, setMobileDetailActive] = useState(false);
  const [editingItem, setEditingItem] = useState<SqlSettingCatalogItem | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [reason, setReason] = useState("");

  const loadCatalog = useCallback(async (signal?: AbortSignal) => {
    const nextCatalog = await fetchSqlSettingsCatalog(signal);
    setCatalog(nextCatalog);
    setSelectedGroupKey((current) => nextCatalog.groups.some((group) => group.key === current)
      ? current
      : nextCatalog.groups[0]?.key ?? "credentials");
  }, []);

  useEffect(() => {
    if (!enabled || catalog) return undefined;
    const controller = new AbortController();
    setLoading(true);
    void loadCatalog(controller.signal)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        showToast(error instanceof Error ? error.message : "加载 SQL 设置失败", "error");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [catalog, enabled, loadCatalog, showToast]);

  useEffect(() => {
    if (!enabled || !catalog?.operations.some((operation) => operation.status === "pending" || operation.status === "running")) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      void loadCatalog().catch(() => undefined);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [catalog?.operations, enabled, loadCatalog]);

  const openEditor = useCallback((item: SqlSettingCatalogItem) => {
    setEditingItem(item);
    setDraftValue(initialOption(item));
    setReason("");
  }, []);

  const closeEditor = useCallback(() => {
    if (submitting) return;
    setEditingItem(null);
    setDraftValue("");
    setReason("");
  }, [submitting]);

  const submitOperation = useCallback(async () => {
    if (!editingItem || !reason.trim()) return;
    setSubmitting(true);
    try {
      const body = editingItem.managementMode === "password-rotation"
        ? { operation: "rotate-runtime-password", reason: reason.trim(), confirmation: "ROTATE" }
        : {
            operation: "set-runtime-setting",
            settingKey: editingItem.key,
            value: draftValue,
            expectedCurrentValueMs: editingItem.currentValueMs,
            reason: reason.trim(),
          };
      const response = await fetch(workspacePath("/api/settings/governance/sql-settings"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await responseError(response, "提交 SQL 设置操作失败"));
      await loadCatalog();
      setEditingItem(null);
      showToast(editingItem.managementMode === "password-rotation" ? "密码轮换请求已提交" : "SQL 设置变更已提交", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "提交 SQL 设置操作失败", "error");
    } finally {
      setSubmitting(false);
    }
  }, [draftValue, editingItem, loadCatalog, reason, showToast]);

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
      return createPageBody([createStatusSection("sql-settings-empty", { kind: "empty", content: "暂无 SQL 设置" })]);
    }

    const settingColumns: DataSurfaceColumnSpec<SqlSettingCatalogItem>[] = [
      {
        key: "setting",
        label: "配置项",
        width: "lg",
        wrap: "wrap",
        cell: (item) => ({
          kind: "group",
          direction: "column",
          items: [
            { kind: "text", value: item.label, emphasis: "medium" },
            { kind: "text", value: item.description, tone: "muted" },
          ],
        }),
      },
      {
        key: "currentValue",
        label: "当前值",
        width: "lg",
        cell: (item) => {
          const editing = editingItem?.key === item.key;
          if (editing) {
            return {
              kind: "group",
              direction: "column",
              items: [
                ...(item.managementMode === "runtime-setting" ? [{
                  kind: "input" as const,
                  spec: {
                    valueType: "string" as const,
                    control: "choice" as const,
                    state: "required" as const,
                    options: { source: "static" as const, items: item.options },
                  },
                  value: draftValue,
                  density: "compact" as const,
                  ariaLabel: `${item.label}新值`,
                  onChange: (value: unknown) => setDraftValue(String(value ?? "")),
                }] : []),
                {
                  kind: "input" as const,
                  spec: { valueType: "string" as const, control: "text" as const, state: "required" as const },
                  value: reason,
                  density: "compact" as const,
                  placeholder: "变更原因",
                  ariaLabel: `${item.label}变更原因`,
                  onChange: (value: unknown) => setReason(String(value ?? "")),
                },
              ],
            };
          }
          return {
            kind: "group",
            direction: "column",
            items: [
              { kind: "text", value: currentValue(item), font: "mono", emphasis: "medium" },
              { kind: "text", value: `建议：${item.recommendedValue}`, tone: "muted" },
              { kind: "text", value: sourceAndEffect(item), tone: "muted" },
              ...(item.pendingRestart ? [{ kind: "badge" as const, label: "待重启", tone: "amber" as const }] : []),
            ],
          };
        },
      },
      {
        key: "management",
        label: "状态",
        width: "sm",
        cell: (item) => ({
          kind: "group",
          direction: "column",
          items: [
            { kind: "badge", ...MANAGEMENT_VIEW[item.managementMode] },
            { kind: "badge", ...STATUS_VIEW[item.status] },
          ],
        }),
      },
      {
        key: "action",
        label: "操作",
        width: "sm",
        cell: (item) => {
          const active = activeOperationForItem(catalog.operations, item);
          if (item.managementMode !== "runtime-setting" && item.managementMode !== "password-rotation") {
            return { kind: "text", value: "—", tone: "muted" };
          }
          if (editingItem?.key === item.key) {
            const canSubmit = !submitting
              && reason.trim().length >= 4
              && (item.managementMode === "password-rotation" || Boolean(draftValue));
            return {
              kind: "actions",
              actions: [
                {
                  key: `save-${item.key}`,
                  label: item.managementMode === "password-rotation" ? "确认轮换" : "保存变更",
                  title: item.managementMode === "password-rotation" ? "确认轮换数据库密码" : "保存 SQL 设置变更",
                  icon: "check",
                  presentation: "glyph",
                  tone: "emerald",
                  disabled: !canSubmit,
                  onClick: () => void submitOperation(),
                },
                {
                  key: `cancel-${item.key}`,
                  label: "取消",
                  title: "取消编辑",
                  icon: "x",
                  presentation: "glyph",
                  tone: "slate",
                  disabled: submitting,
                  onClick: closeEditor,
                },
              ],
            };
          }
          return {
            kind: "action",
            action: {
              key: `edit-${item.key}`,
              label: active
                ? OPERATION_STATUS_VIEW[active.status].label
                : item.managementMode === "password-rotation" ? "轮换数据库密码" : `修改${item.label}`,
              title: active
                ? OPERATION_STATUS_VIEW[active.status].label
                : item.managementMode === "password-rotation" ? "轮换数据库密码" : `修改${item.label}`,
              icon: active ? "refresh" : item.managementMode === "password-rotation" ? "refresh" : "edit",
              presentation: "glyph",
              tone: active ? "amber" : item.managementMode === "password-rotation" ? "red" : "slate",
              disabled: Boolean(active) || (item.managementMode === "runtime-setting" && item.currentValueMs === null),
              onClick: () => openEditor(item),
            },
          };
        },
      },
    ];

    const activeCount = catalog.operations.filter((operation) => operation.status === "pending" || operation.status === "running").length;

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
        createPanelSection("sql-settings-options", {
          title: selectedGroup.label,
          sections: [
            createMessageSection("sql-settings-group-description", {
              content: selectedGroup.description,
              tone: "muted",
              presentation: "plain",
            }),
            ...(activeCount > 0 ? [createMessageSection("sql-settings-active", {
              content: `${activeCount} 个 SQL 操作正在等待或执行`,
              tone: "warning" as const,
            })] : []),
            createPageTableSection("sql-settings-table", {
              rows: selectedGroup.items,
              columns: settingColumns,
              visibleColumns: settingColumns.map((column) => column.key),
              rowKey: (item) => item.key,
              emptyText: "当前分类暂无配置项",
              presentation: { density: "compact", cellWrap: "wrap", rowHover: "neutral" },
            }),
          ],
        }),
        ...(catalog.operations.length > 0 ? [
          createPanelSection("sql-settings-operations-panel", {
            title: "最近操作",
            sections: [createPageTableSection("sql-settings-operations", {
              rows: catalog.operations.slice(0, 8),
              columns: OPERATION_COLUMNS,
              visibleColumns: OPERATION_COLUMNS.map((column) => column.key),
              rowKey: (operation) => operation.id,
              emptyText: "暂无 SQL 操作",
              presentation: { density: "compact", cellWrap: "wrap", rowHover: "neutral" },
            })],
          }),
        ] : []),
      ]),
      desktop: { ratio: SQL_SETTINGS_DESKTOP_RATIO },
      mobile: { detailActive: mobileDetailActive, onNavigateToList: () => setMobileDetailActive(false) },
    });
  }, [catalog, closeEditor, draftValue, editingItem, loading, mobileDetailActive, openEditor, reason, selectedGroupKey, submitOperation, submitting]);
}
