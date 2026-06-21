"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useCallback } from "react";
import {
  ModuleGridPage,
} from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import UsernameModal from "./UsernameModal";
import PasswordModal from "./PasswordModal";
import ModuleCard from "../ModuleCard";

type SettingsView = "home" | "account" | "governance";

const governanceItems = [
  {
    title: "FK Registry",
    description: "登记字段来源、目标对象、搜索解析、nullable 与生命周期默认范围。",
    color: "blue",
    icon: <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>,
  },
  {
    title: "Core UI 注册表",
    description: "查看已注册 UI、中文分类、组合关系和当前消费文件。",
    color: "emerald",
    href: "/settings/governance/ui-registry",
    icon: <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h7M14 18h6M8 9v6M16 3v6" /></svg>,
  },
  {
    title: "页面样式预览",
    description: "查看八大板块的页眉、Tab、Toolbar、主体、页脚、预览和弹出框样式。",
    color: "cyan",
    href: "/settings/governance/toolbar-preview",
    icon: <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7h16M7 12h10M9 17h6M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" /></svg>,
  },
  {
    title: "生命周期规则",
    description: "定义现用、归档、离职等状态，以及默认搜索和保存范围。",
    color: "emerald",
    icon: <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6l4 2M21 12a9 9 0 11-3.21-6.9M21 3v5h-5" /></svg>,
  },
  {
    title: "字段必填策略",
    description: "区分 UI 星号提示和后端 nullable 硬约束，避免关键关系被清空。",
    color: "indigo",
    icon: <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M6 4h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2z" /></svg>,
  },
  {
    title: "字段唯一性 / 编码规则",
    description: "集中管理编码生成、唯一性校验、命名口径和冲突提示。",
    color: "cyan",
    icon: <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h10M7 12h10M7 17h6M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" /></svg>,
  },
  {
    title: "引用阻断规则",
    description: "目标归档、删除、离职前检查现用引用，并输出可处理的阻断说明。",
    color: "purple",
    icon: <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 13a5 5 0 007.07 0l1.41-1.41a5 5 0 00-7.07-7.07L10 5.93M14 11a5 5 0 00-7.07 0l-1.41 1.41a5 5 0 007.07 7.07L14 18.07" /></svg>,
  },
  {
    title: "审计策略",
    description: "自动清空、策略变更和生命周期操作必须留痕，支持追溯。",
    color: "blue",
    icon: <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5h6M9 9h6M9 13h3m-7 8h14a2 2 0 002-2V7.5a2 2 0 00-.586-1.414l-3.5-3.5A2 2 0 0015.5 2H5a2 2 0 00-2 2v15a2 2 0 002 2z" /></svg>,
  },
];

export default function SettingsClient({
  user: initialUser,
  view = "home",
}: {
  user: SessionUser;
  hideShell?: boolean;
  view?: SettingsView;
}) {
  const [user, setUser] = useState<SessionUser>(initialUser);
  const visibleResourceKeys = user.visibleResourceKeys || [];
  const hasApiAccess = visibleResourceKeys.includes("settings.api");
  const hasDocsApiAccess = visibleResourceKeys.includes("docs.api") || hasApiAccess;
  const hasAdminAccess = (user.manageableResourceKeys?.length ?? 0) > 0;
  const hasGovernanceAccess = visibleResourceKeys.includes("settings.governance");

  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const handleUsernameSuccess = useCallback(() => {
    fetch(workspacePath("/api/auth/me"))
      .then((r) => r.json())
      .then((d) => { if (d.user) setUser(d.user); })
      .catch(() => {});
  }, []);

  return (
    <>
      {view === "home" && (
        <ModuleGridPage title="设置" summary="个人设置、系统配置" centered>
          <ModuleCard
            title="账号与接入"
            description="账号、安全密码、API 接入"
            color="blue"
            icon={
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a7.5 7.5 0 0115 0M17.25 11.25h1.5a2.25 2.25 0 012.25 2.25v4.5a2.25 2.25 0 01-2.25 2.25h-1.5M15 15.75h6" />
              </svg>
            }
            href="/settings/account"
          />

          {hasGovernanceAccess && (
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
              description="API Key、接入说明和接口调用方式。"
              color="purple"
              icon={
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16M7 8l-4 4 4 4M17 8l4 4-4 4" />
                </svg>
              }
              href="/settings/api"
            />
          )}

          {hasAdminAccess && (
            <ModuleCard
              title="数据治理"
              description="FK、生命周期、必填、编码、引用阻断和审计策略。"
              color="cyan"
              icon={
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7c0-1.657 3.582-3 8-3s8 1.343 8 3-3.582 3-8 3-8-1.343-8-3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v5c0 1.657 3.582 3 8 3s8-1.343 8-3V7M4 12v5c0 1.657 3.582 3 8 3s8-1.343 8-3v-5" />
                </svg>
              }
              badge="只读预览"
              href="/settings/governance"
            />
          )}
        </ModuleGridPage>
      )}

      {view === "account" && (
        <ModuleGridPage title="账号与接入" summary={`当前用户名：${user.username || "(未设置)"}`} centered>
          <ModuleCard
            title="账号与接入"
            description="登录账号、安全密码和 API 接入"
            color="blue"
            icon={
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a7.5 7.5 0 0115 0M17.25 11.25h1.5a2.25 2.25 0 012.25 2.25v4.5a2.25 2.25 0 01-2.25 2.25h-1.5M15 15.75h6" />
              </svg>
            }
            actions={[
              { label: "修改账号", onClick: () => setShowUsernameModal(true), variant: "primary" },
              { label: "修改密码", onClick: () => setShowPasswordModal(true), variant: "secondary" },
              ...(hasDocsApiAccess ? [{ label: "API 指南", href: "/docs/api-guide", variant: "secondary" as const }] : []),
            ]}
          />
        </ModuleGridPage>
      )}

      {view === "governance" && hasAdminAccess && (
        <ModuleGridPage
          title="数据治理"
          summary="FK、生命周期、必填、编码、引用阻断和审计策略"
          centered
        >
          {governanceItems.map((item) => (
            <ModuleCard
              key={item.title}
              title={item.title}
              description={item.description}
              icon={item.icon}
              color={item.color}
              href={item.href}
            />
          ))}
        </ModuleGridPage>
      )}

      <UsernameModal open={showUsernameModal} onClose={() => setShowUsernameModal(false)} user={user} onSuccess={handleUsernameSuccess} />
      <PasswordModal open={showPasswordModal} onClose={() => setShowPasswordModal(false)} />
    </>
  );
}
