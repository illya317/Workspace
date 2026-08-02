import { workspacePath } from "@workspace/core/routing";
import { ModuleCard, ModuleGridPage } from "@workspace/core/ui";

const workHomeIcons = {
  project: (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5h6M9 9h6M9 13h3m-7 8h14a2 2 0 002-2V7.5a2 2 0 00-.586-1.414l-3.5-3.5A2 2 0 0015.5 2H5a2 2 0 00-2 2v15a2 2 0 002 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 2v4a2 2 0 002 2h4M15 17l2 2 4-5" />
    </svg>
  ),
  work: (
    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
    </svg>
  ),
};

export function WorkDepartmentEntryFallback({ message }: { message: string }) {
  return (
    <ModuleGridPage title="部门空间" summary={message} gridClassName="lg:grid-cols-2">
      <ModuleCard title="工作空间" description="返回工作空间" icon={workHomeIcons.work} color="emerald" href={workspacePath("/work/me")} />
      <ModuleCard title="工作管理" description="返回工作入口" icon={workHomeIcons.work} color="emerald" href={workspacePath("/work")} />
    </ModuleGridPage>
  );
}

export function WorkProjectWorkspaceFallback({ message }: { message: string }) {
  return (
    <ModuleGridPage title="项目空间" summary={message} gridClassName="lg:grid-cols-2">
      <ModuleCard title="项目管理" description="返回项目总览维护项目资料" icon={workHomeIcons.project} color="emerald" href={workspacePath("/work/project")} />
      <ModuleCard title="工作空间" description="返回工作空间" icon={workHomeIcons.work} color="emerald" href={workspacePath("/work/me")} />
    </ModuleGridPage>
  );
}
