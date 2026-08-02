import type { ApiMethod } from "./api-contract-types";

function route(method: ApiMethod, path: string, notes?: string) {
  return notes ? { method, path, notes } : { method, path };
}

export const SETTINGS_BUSINESS_ACTION_REGISTRATIONS = [
  {
    moduleKey: "settings",
    resourceKey: "settings.account",
    originHrefPattern: "/settings/account?tab=subscriptions",
    eligibility: "permission_only",
    key: "settings.account.notificationSubscription.save",
    label: "设置个人通知订阅",
    writeKind: "save",
    targetKind: "NotificationSubscription",
    directPermissionAction: "read",
    apiRoutes: [
      route("PUT", "/api/modules/settings/account/notification-subscriptions/:eventKey", "设置当前用户的可选通知订阅覆盖。"),
      route("DELETE", "/api/modules/settings/account/notification-subscriptions/:eventKey", "删除当前用户的订阅覆盖并恢复注册表默认值。"),
    ],
    notes: "账号自助写入只作用于当前认证用户；订阅开启时还会按通知注册表复核目标业务资源 read 权限。",
  },
  {
    moduleKey: "settings",
    resourceKey: "settings.notifications",
    originHrefPattern: "/settings/api",
    eligibility: "permission_only",
    key: "settings.notifications.publication.create",
    label: "创建通知发布",
    writeKind: "create",
    targetKind: "NotificationPublication",
    directPermissionAction: "create",
    apiRoutes: [
      route("POST", "/api/modules/settings/notifications/publications", "通过已发布定义幂等创建通知。"),
      route("POST", "/api/modules/settings/notifications/group-publications", "通过已启用的受管群策略幂等创建企业微信群投递。"),
    ],
    notes: "调用方仅提交定义键、模板变量与受控受众输入；actor、投递策略和幂等账本由服务端持有。",
  },
] as const;
