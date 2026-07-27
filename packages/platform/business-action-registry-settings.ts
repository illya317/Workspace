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
] as const;
