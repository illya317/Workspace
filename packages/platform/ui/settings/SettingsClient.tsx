"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useCallback } from "react";
import {
  ModuleGridPage,
} from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import AccountSettingsPanel from "./AccountSettingsPanel";
import ModuleCard from "../ModuleCard";
import type { ApiAccessModuleRow } from "./ApiAccessClient";

type SettingsView = "home" | "account" | "governance";

export default function SettingsClient({
  user: initialUser,
  view = "home",
  apiAccessModules = [],
}: {
  user: SessionUser;
  hideShell?: boolean;
  view?: SettingsView;
  apiAccessModules?: ApiAccessModuleRow[];
}) {
  const [user, setUser] = useState<SessionUser>(initialUser);
  const visibleResourceKeys = user.visibleResourceKeys || [];
  const hasApiAccess = visibleResourceKeys.includes("settings.api");
  const hasAdminAccess = (user.manageableResourceKeys?.length ?? 0) > 0;

  const refreshUser = useCallback(() => {
    fetch(workspacePath("/api/auth/me"))
      .then((r) => r.json())
      .then((d) => { if (d.user) setUser(d.user); })
      .catch(() => {});
  }, []);

  return (
    <>
      {view === "home" && (
        <ModuleGridPage title="设置" centered>
          <ModuleCard
            title="账号与接入"
            description="账号资料、密码、头像和个人 API 接入。"
            color="blue"
            icon={
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a7.5 7.5 0 0115 0M17.25 11.25h1.5a2.25 2.25 0 012.25 2.25v4.5a2.25 2.25 0 01-2.25 2.25h-1.5M15 15.75h6" />
              </svg>
            }
            href="/settings/account"
          />

          {hasAdminAccess && (
            <ModuleCard
              title="系统管理"
              description="用户、权限、资源和管理员配置。"
              color="indigo"
              icon={
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3l7.5 3v5.25c0 4.58-3.1 8.84-7.5 9.75-4.4-.91-7.5-5.17-7.5-9.75V6L12 3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4" />
                </svg>
              }
              href="/settings/admin"
            />
          )}

          {hasApiAccess && (
            <ModuleCard
              title="API 接入"
              description="Open API Client、Scope 授权和调用日志。"
              color="purple"
              icon={
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16M7 8l-4 4 4 4M17 8l4 4-4 4" />
                </svg>
              }
              href="/settings/api"
            />
          )}

        </ModuleGridPage>
      )}

      {view === "account" && (
        <AccountSettingsPanel user={user} onUserRefresh={refreshUser} apiAccessModules={apiAccessModules} />
      )}

    </>
  );
}
