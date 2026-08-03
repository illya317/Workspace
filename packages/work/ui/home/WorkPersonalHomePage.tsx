"use client";

import { useCallback, useEffect, useMemo, useState, useTransition, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { workspacePath } from "@workspace/core/routing";
import {
  createMetricsSection,
  createPageBody,
  createPageDataSection,
  createPageTabBar,
  createSectionSection,
  PageSurface,
  useFeedback,
  type DataSurfaceStructuredCellSpec,
  type PageSurfaceTabBarSpec,
} from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { createStandardBusinessSpaceNavigationSelector } from "@workspace/platform/ui";
import { renderAppShellPage } from "@workspace/platform/ui/app-shell-page";
import { getWorkSpaceHomePath } from "../works/space-paths";
import type { WorkTaskSpace } from "../works/types";
import { loadWorkPersonalHomeNavigation } from "./WorkPersonalHomeApi";

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

const EMPTY_NAVIGATION: WorkPersonalHomeNavigationData = {
  spaces: [],
  preferredDepartmentIds: [],
  preferredProjectIds: [],
};

export function WorkPersonalHomePageView({
  user,
  navigation,
  contributions = [],
}: {
  user: SessionUser;
  navigation?: WorkPersonalHomeNavigationData;
  contributions?: PersonalHomeViewContribution[];
}) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [activeTab, setActiveTab] = useState("overview");
  const [navigationData, setNavigationData] = useState<WorkPersonalHomeNavigationData>(() => navigation ?? EMPTY_NAVIGATION);
  const [navigationLoading, setNavigationLoading] = useState(!navigation);
  const [navigationPending, startNavigation] = useTransition();
  const navigate = useCallback((href: string) => {
    startNavigation(() => router.push(workspacePath(href)));
  }, [router]);
  useEffect(() => {
    router.prefetch(workspacePath("/work/me/space"));
  }, [router]);
  useEffect(() => {
    if (navigation) return;
    let cancelled = false;
    async function loadNavigation() {
      try {
        const data = await loadWorkPersonalHomeNavigation<WorkTaskSpace>();
        if (!cancelled) setNavigationData(data);
      } catch (error) {
        if (!cancelled) notify(error instanceof Error ? error.message : "加载工作空间失败", "error");
      } finally {
        if (!cancelled) setNavigationLoading(false);
      }
    }
    void loadNavigation();
    return () => { cancelled = true; };
  }, [navigation, notify]);
  const personalSpace = navigationData.spaces.find((space) => space.targetType === "personal" && space.targetId === user.id) ?? null;
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
        navigate(contribution.href);
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
    spaces: navigationData.spaces,
    preferredDepartmentIds: navigationData.preferredDepartmentIds,
    preferredProjectIds: navigationData.preferredProjectIds,
    active: { targetType: "personal", targetId: user.id },
    label: "工作空间",
    order: ["personal", "departments", "projects"],
    onChange: (space) => navigate(getWorkSpaceHomePath(space.targetType, space.targetId)),
  });

  return renderAppShellPage({
    title: "个人主页",
    backHref: "/work",
    user,
    headerSelector: spaceSelector,
    children: ActiveContributionView
      ? <ActiveContributionView userId={user.id} tabbar={tabbar} />
      : <PageSurface kind="standard" tabbar={tabbar} body={personalOverviewBody({
          user,
          space: personalSpace,
          loading: navigationLoading,
          opening: navigationPending,
          onOpen: () => navigate("/work/me/space"),
        })} />,
  });
}

function personalOverviewBody({
  user,
  space,
  loading,
  opening,
  onOpen,
}: {
  user: SessionUser;
  space: WorkTaskSpace | null;
  loading: boolean;
  opening: boolean;
  onOpen: () => void;
}) {
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
        label: opening ? "打开中" : "查看",
        icon: "view",
        variant: "primary",
        disabled: opening,
        onClick: onOpen,
      }],
      sections: [createPageDataSection("personal-profile", {
        kind: "structured",
        rows: personalRows(user, space, loading),
        frame: "bordered",
        presentation: { density: "compact", header: "tinted" },
      })],
    }),
  ]);
}

function personalRows(user: SessionUser, space: WorkTaskSpace | null, loading: boolean): DataSurfaceStructuredCellSpec[][] {
  return [
    [header("字段"), header("内容")],
    [label("姓名"), value(user.employeeName || "未绑定员工")],
    [label("公司"), value(user.company || "-")],
    [label("空间状态"), value(loading ? "加载中" : space?.lifecycleStatus === "inactive" ? "未在职" : "可用")],
    [label("工作内容"), value(loading ? "加载中" : `目标 ${space?.counts.objective ?? 0} · KR ${space?.counts.keyResult ?? 0} · 任务 ${space?.counts.task ?? 0}`)],
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
