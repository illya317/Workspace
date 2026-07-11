import { workspacePath } from "@workspace/core/routing";
import { ModuleCard, ModuleGridPage } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import type { ReactNode } from "react";

type WorkHomeCard = {
  key: string;
  title: string;
  description: string;
  href: string;
  resourceKey: string;
  icon: ReactNode;
  requiresDepartmentHome?: boolean;
};

const workHomeIcons = {
  department: (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 20V8.5A2.5 2.5 0 016.5 6H10V4.5A2.5 2.5 0 0112.5 2h5A2.5 2.5 0 0120 4.5V20" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.5 20h19M7 10h2.5M7 14h2.5M14 6h2.5M14 10h2.5M14 14h2.5" />
    </svg>
  ),
  project: (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5h6M9 9h6M9 13h3m-7 8h14a2 2 0 002-2V7.5a2 2 0 00-.586-1.414l-3.5-3.5A2 2 0 0015.5 2H5a2 2 0 00-2 2v15a2 2 0 002 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 2v4a2 2 0 002 2h4M15 17l2 2 4-5" />
    </svg>
  ),
  meeting: (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h6m-8 8h14a2 2 0 002-2V7a2 2 0 00-2-2h-2.5L14 3H10L7.5 5H5a2 2 0 00-2 2v11a2 2 0 002 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16l2 2 5-5" />
    </svg>
  ),
  work: (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
    </svg>
  ),
};

const WORK_HOME_CARDS: WorkHomeCard[] = [
  {
    key: "personal",
    title: "工作空间",
    description: "个人、部门和项目空间里的计划与执行",
    href: "/work/me",
    resourceKey: "work.tasks",
    icon: workHomeIcons.work,
  },
  {
    key: "department",
    title: "部门主页",
    description: "部门总览、部门甘特和部门空间入口",
    href: "/work/department",
    resourceKey: "work.tasks",
    icon: workHomeIcons.department,
    requiresDepartmentHome: true,
  },
  {
    key: "project",
    title: "项目管理",
    description: "项目总览、项目资料和成员维护",
    href: "/work/project",
    resourceKey: "work.projects",
    icon: workHomeIcons.project,
  },
  {
    key: "meeting",
    title: "会议管理",
    description: "会议、纪要、表决和决议",
    href: "/work/meeting",
    resourceKey: "work.meetings",
    icon: workHomeIcons.meeting,
  },
];

export function WorkHomePageView({
  user,
  canEnterDepartmentHome,
}: {
  user: SessionUser;
  canEnterDepartmentHome?: boolean;
}) {
  const visibleCards = WORK_HOME_CARDS.filter((card) => (
    canEnter(user, card.resourceKey) && (!card.requiresDepartmentHome || canEnterDepartmentHome)
  ));

  return (
    <ModuleGridPage title="工作管理">
      {visibleCards.map((card) => (
        <ModuleCard
          key={card.key}
          title={card.title}
          description={card.description}
          icon={card.icon}
          color="emerald"
          href={workspacePath(card.href)}
        />
      ))}
    </ModuleGridPage>
  );
}

export function WorkDepartmentEntryFallback({ message }: { message: string }) {
  return (
    <ModuleGridPage title="部门空间" summary={message} gridClassName="lg:grid-cols-2">
      <ModuleCard
        title="工作空间"
        description="返回工作空间"
        icon={workHomeIcons.work}
        color="emerald"
        href={workspacePath("/work/me")}
      />
      <ModuleCard
        title="工作管理"
        description="返回工作入口"
        icon={workHomeIcons.work}
        color="emerald"
        href={workspacePath("/work")}
      />
    </ModuleGridPage>
  );
}

export function WorkProjectWorkspaceFallback({ message }: { message: string }) {
  return (
    <ModuleGridPage title="项目空间" summary={message} gridClassName="lg:grid-cols-2">
      <ModuleCard
        title="项目管理"
        description="返回项目总览维护项目资料"
        icon={workHomeIcons.project}
        color="emerald"
        href={workspacePath("/work/project")}
      />
      <ModuleCard
        title="工作空间"
        description="返回工作空间"
        icon={workHomeIcons.work}
        color="emerald"
        href={workspacePath("/work/me")}
      />
    </ModuleGridPage>
  );
}

function canEnter(user: SessionUser, resourceKey: string) {
  return Boolean(user.isSuperAdmin || user.visibleResourceKeys?.includes(resourceKey));
}
