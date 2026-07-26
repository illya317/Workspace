"use client";

import { useMemo, useState, type ComponentType } from "react";
import { workspacePath } from "@workspace/core/routing";
import {
  createMetricsSection,
  createPageBody,
  createPageDataSection,
  createPageTabBar,
  createSectionSection,
  PageSurface,
  type DataSurfaceStructuredCellSpec,
  type PageSurfaceTabBarSpec,
} from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { createStandardBusinessSpaceNavigationSelector } from "@workspace/platform/ui";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { getWorkSpaceHomePath } from "../works/space-paths";
import type { WorkTaskSpace } from "../works/types";

type PersonalHomeViewContributionBase = {
  key: string;
  label: string;
  order: number;
};

export type PersonalHomeViewContribution = PersonalHomeViewContributionBase & (
  | { component: ComponentType<{ userId: number; tabbar: PageSurfaceTabBarSpec }>; href?: never }
  | { component?: never; href: string }
);

export type WorkPersonalHomeNavigationData = {
  spaces: WorkTaskSpace[];
  preferredDepartmentIds: number[];
  preferredProjectIds: number[];
};

export function WorkPersonalHomePageView({
  user,
  navigation,
  contributions = [],
}: {
  user: SessionUser;
  navigation: WorkPersonalHomeNavigationData;
  contributions?: PersonalHomeViewContribution[];
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const personalSpace = navigation.spaces.find((space) => space.targetType === "personal" && space.targetId === user.id) ?? null;
  const orderedContributions = useMemo(
    () => [...contributions].sort((left, right) => left.order - right.order || left.key.localeCompare(right.key)),
    [contributions],
  );
  const tabs = useMemo(() => [
    { key: "overview", label: "个人总览" },
    ...orderedContributions.map(({ key, label }) => ({ key, label })),
  ], [orderedContributions]);
  const tabbar = createPageTabBar({
    items: tabs,
    active: activeTab,
    onChange: (key) => {
      const contribution = orderedContributions.find((candidate) => candidate.key === key);
      if (contribution?.href) {
        window.location.assign(workspacePath(contribution.href));
        return;
      }
      setActiveTab(key);
    },
    variant: "large",
    ariaLabel: "个人主页视图",
  });
  const activeContribution = orderedContributions.find((contribution) => contribution.key === activeTab) ?? null;
  const ActiveContributionView = activeContribution?.component ?? null;
  const spaceSelector = createStandardBusinessSpaceNavigationSelector({
    spaces: navigation.spaces,
    preferredDepartmentIds: navigation.preferredDepartmentIds,
    preferredProjectIds: navigation.preferredProjectIds,
    active: { targetType: "personal", targetId: user.id },
    label: "工作空间",
    order: ["personal", "departments", "projects"],
    onChange: (space) => window.location.assign(workspacePath(getWorkSpaceHomePath(space.targetType, space.targetId))),
  });

  return renderAppShellPage({
    title: "个人主页",
    backHref: "/work",
    user,
    headerSelector: spaceSelector,
    children: ActiveContributionView
      ? <ActiveContributionView userId={user.id} tabbar={tabbar} />
      : <PageSurface kind="standard" tabbar={tabbar} body={personalOverviewBody(user, personalSpace)} />,
  });
}

function personalOverviewBody(user: SessionUser, space: WorkTaskSpace | null) {
  const counts = space?.counts ?? { objective: 0, keyResult: 0, task: 0, archived: 0 };
  return createPageBody([
    createMetricsSection("personal-home-metrics", {
      metrics: [
        { key: "objectives", label: "目标", value: counts.objective },
        { key: "key-results", label: "关键结果", value: counts.keyResult },
        { key: "tasks", label: "任务", value: counts.task },
        { key: "archived", label: "已归档", value: counts.archived },
      ],
    }),
    createSectionSection("personal-workspace", {
      title: "我的工作空间",
      actions: [{
        key: "open-personal-space",
        label: "查看",
        icon: "view",
        variant: "primary",
        onClick: () => window.location.assign(workspacePath("/work/me/space")),
      }],
      sections: [createPageDataSection("personal-profile", {
        kind: "structured",
        rows: personalRows(user, space),
        frame: "bordered",
        presentation: { density: "compact", header: "tinted" },
      })],
    }),
  ]);
}

function personalRows(user: SessionUser, space: WorkTaskSpace | null): DataSurfaceStructuredCellSpec[][] {
  return [
    [header("字段"), header("内容")],
    [label("姓名"), value(user.employeeName || "未绑定员工")],
    [label("公司"), value(user.company || "-")],
    [label("空间状态"), value(space?.lifecycleStatus === "inactive" ? "未在职" : "可用")],
    [label("工作内容"), value(`目标 ${space?.counts.objective ?? 0} · KR ${space?.counts.keyResult ?? 0} · 任务 ${space?.counts.task ?? 0}`)],
  ];
}

function header(content: string): DataSurfaceStructuredCellSpec {
  return { content, header: true, cellRole: "header" };
}

function label(content: string): DataSurfaceStructuredCellSpec {
  return { content, cellRole: "label", width: "sm" };
}

function value(content: string): DataSurfaceStructuredCellSpec {
  return { content, cellRole: "value" };
}
