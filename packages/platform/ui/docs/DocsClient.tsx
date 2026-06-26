"use client";

import { useRouter } from "next/navigation";
import { PageSurface } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";

function getDocCategories(): Record<string, Array<{ title: string; href: string }>> {
  return {
  "入职指南": [
    { title: "入职流程说明", href: "/docs/onboarding" },
    { title: "公司制度介绍", href: "/docs/policies" },
    { title: "办公环境指引", href: "/docs/office-guide" },
  ],
  "常用工具": [
    { title: "系统使用手册", href: "/docs/system-guide" },
    { title: "工作汇报填写说明", href: "/docs/report-guide" },
  ],
  "规章制度": [
    { title: "考勤管理制度", href: "/docs/attendance" },
    { title: "请假流程", href: "/docs/leave" },
    { title: "报销规范", href: "/docs/expense" },
  ],
  "岗位管理": [
    { title: "岗位说明书", href: "/docs/positions" },
  ],
  };
}

export default function DocsClient({ user: _user, hideShell }: { user: SessionUser; hideShell?: boolean }) {
  const router = useRouter();

  return (
    <PageSurface
      kind="settings"
      contentClassName="py-10"
      blocks={[{
        kind: "moduleGrid",
        key: "docs-grid",
        centered: hideShell,
        title: hideShell ? undefined : "文档中心",
        summary: hideShell ? undefined : "员工手册、操作指南、规章制度等文档汇总",
        items: Object.entries(getDocCategories()).map(([category, docs]) => ({
          key: category,
          title: category,
          description: docs.map((doc) => doc.title).join("、"),
          color: "purple",
          onClick: () => router.push(docs[0]?.href || "/docs"),
          icon: (
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.75c-1.8-1.1-4.05-1.75-6.5-1.75v12c2.45 0 4.7.65 6.5 1.75m0-12c1.8-1.1 4.05-1.75 6.5-1.75v12c-2.45 0-4.7.65-6.5 1.75m0-12v12" />
            </svg>
          ),
        })),
      }]}
    />
  );
}
