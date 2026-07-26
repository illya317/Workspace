import type { FormSurfaceItemSpec } from "@workspace/core/ui";

export type DataQualityNotificationRouteDraft = {
  id: string;
  resourceKey: string | null;
  resourceParentKey?: string | null;
  departmentId: number | null;
  recipientUsernames: string[];
};

export type DataQualityNotificationRoutingOptions = {
  resources: Array<{
    value: string;
    label: string;
    l1Value: string;
    l1Label: string;
    l2Label: string;
  }>;
  departments: Array<{ value: string; label: string; subtitle?: string }>;
  users: Array<{ value: string; label: string; searchText?: string; disabled?: boolean }>;
};

type WorkspaceNotificationDraft = {
  enabled: boolean;
  fallbackRecipientUsernames: string[];
  routes: DataQualityNotificationRouteDraft[];
};

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function recipientField(input: {
  key: string;
  label: string;
  usernames: string[];
  options: DataQualityNotificationRoutingOptions["users"];
  disabled: boolean;
  onChange: (usernames: string[]) => void;
}): FormSurfaceItemSpec<string> {
  const labels = new Map(input.options.map((option) => [option.value, option.label]));
  const available = input.options.filter((option) => !option.disabled && !input.usernames.includes(option.value));
  return {
    kind: "tagList",
    key: input.key,
    label: input.label,
    required: true,
    items: input.usernames,
    getKey: (username) => username,
    getLabel: (username) => labels.get(username) ?? username,
    onRemove: (username) => input.onChange(input.usernames.filter((item) => item !== username)),
    confirmRemove: false,
    disabled: input.disabled,
    append: input.disabled || available.length === 0 ? undefined : {
      field: {
        key: `${input.key}-append`,
        label: "添加接收人",
        spec: {
          valueType: "string",
          control: "choice",
          options: { source: "static", items: available, visibleCount: 8 },
        },
        value: "",
        placeholder: "添加接收人",
        onChange: (value) => {
          const username = String(value ?? "");
          if (username) input.onChange(unique([...input.usernames, username]));
        },
      },
    },
  };
}

function routeTitle(route: DataQualityNotificationRouteDraft, options: DataQualityNotificationRoutingOptions) {
  const selectedResource = options.resources.find((option) => option.value === route.resourceKey);
  const parentKey = route.resourceParentKey ?? selectedResource?.l1Value;
  const resource = selectedResource?.label ?? options.resources.find((option) => option.l1Value === parentKey)?.l1Label;
  const department = options.departments.find((option) => Number(option.value) === route.departmentId)?.label;
  return [resource, department].filter(Boolean).join(" · ") || "新分流规则";
}

function l1Options(resources: DataQualityNotificationRoutingOptions["resources"]) {
  return [...new Map(resources.map((resource) => [resource.l1Value, {
    value: resource.l1Value,
    label: resource.l1Label,
  }])).values()];
}

export function dataQualityNotificationRoutingItems(input: {
  workspace: WorkspaceNotificationDraft;
  options: DataQualityNotificationRoutingOptions;
  wecomGroupField: FormSurfaceItemSpec<string>;
  onChange: (workspace: WorkspaceNotificationDraft) => void;
}): FormSurfaceItemSpec<string>[] {
  const disabled = !input.workspace.enabled;
  const resourceL1Options = l1Options(input.options.resources);
  const updateRoute = (index: number, patch: Partial<DataQualityNotificationRouteDraft>) => {
    input.onChange({
      ...input.workspace,
      routes: input.workspace.routes.map((route, routeIndex) => routeIndex === index ? { ...route, ...patch } : route),
    });
  };
  return [
    recipientField({
      key: "workspace-fallback-recipients",
      label: "未匹配接收人",
      usernames: input.workspace.fallbackRecipientUsernames,
      options: input.options.users,
      disabled,
      onChange: (fallbackRecipientUsernames) => input.onChange({ ...input.workspace, fallbackRecipientUsernames }),
    }),
    {
      kind: "repeatable",
      key: "workspace-notification-routes",
      title: "分流规则",
      subtitle: "精确匹配优先；每条通知只包含同一 L2、同一部门的异常。",
      layout: { columns: 3, density: "compact" },
      empty: "尚未配置分流规则",
      addAction: disabled ? undefined : {
        key: "add-workspace-notification-route",
        label: "添加分流规则",
        icon: "add",
        onClick: () => input.onChange({
          ...input.workspace,
          routes: [...input.workspace.routes, {
            id: globalThis.crypto?.randomUUID?.() ?? `route-${Date.now()}`,
            resourceKey: null,
            resourceParentKey: null,
            departmentId: null,
            recipientUsernames: [],
          }],
        }),
      },
      items: input.workspace.routes.map((route, index) => {
        const selectedResource = input.options.resources.find((option) => option.value === route.resourceKey);
        const selectedL1Value = route.resourceParentKey ?? selectedResource?.l1Value ?? "";
        const resourceL2Options = input.options.resources
          .filter((option) => option.l1Value === selectedL1Value)
          .map((option) => ({ value: option.value, label: option.l2Label }));
        return {
          key: route.id,
          title: routeTitle(route, input.options),
          actions: disabled ? undefined : [{
            key: `remove-route-${route.id}`,
            label: "删除",
            icon: "delete-bin",
            variant: "danger",
            size: "sm",
            onClick: () => input.onChange({
              ...input.workspace,
              routes: input.workspace.routes.filter((_, routeIndex) => routeIndex !== index),
            }),
          }],
          items: [
            {
              key: `route-resource-l1-${route.id}`,
              label: "L1",
              spec: {
                valueType: "string",
                control: "choice",
                options: { source: "static", items: resourceL1Options, visibleCount: 8, unsetLabel: "全部 L1" },
              },
              value: selectedL1Value,
              disabled,
              placeholder: "全部 L1",
              onChange: (value) => {
                const resourceParentKey = String(value ?? "") || null;
                updateRoute(index, {
                  resourceParentKey,
                  resourceKey: selectedResource?.l1Value === resourceParentKey ? route.resourceKey : null,
                });
              },
            },
            {
              key: `route-resource-${route.id}`,
              label: "L2",
              spec: {
                valueType: "string",
                control: "choice",
                options: { source: "static", items: resourceL2Options, visibleCount: 8, unsetLabel: "未选择 L2" },
              },
              value: route.resourceKey ?? "",
              disabled: disabled || !selectedL1Value,
              placeholder: selectedL1Value ? "选择 L2" : "先选择 L1",
              onChange: (value) => updateRoute(index, { resourceKey: String(value ?? "") || null }),
            },
            {
              key: `route-department-${route.id}`,
              label: "部门",
              spec: {
                valueType: "string",
                control: "choice",
                options: { source: "static", items: input.options.departments, visibleCount: 8, unsetLabel: "全部部门" },
              },
              value: route.departmentId ? String(route.departmentId) : "",
              disabled,
              placeholder: "全部部门",
              onChange: (value) => updateRoute(index, { departmentId: Number(value) > 0 ? Number(value) : null }),
            },
            recipientField({
              key: `route-recipients-${route.id}`,
              label: "接收人",
              usernames: route.recipientUsernames,
              options: input.options.users,
              disabled,
              onChange: (recipientUsernames) => updateRoute(index, { recipientUsernames }),
            }),
            ...(index === 0 ? [input.wecomGroupField] : []),
          ],
        };
      }),
    },
    ...(input.workspace.routes.length === 0 ? [input.wecomGroupField] : []),
  ];
}
