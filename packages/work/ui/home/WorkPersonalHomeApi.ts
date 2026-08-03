import { workspacePath } from "@workspace/core/routing";

type WorkPersonalHomeNavigationData<TSpace> = {
  spaces: TSpace[];
  preferredDepartmentIds: number[];
  preferredProjectIds: number[];
};

export async function loadWorkPersonalHomeNavigation<TSpace>(): Promise<WorkPersonalHomeNavigationData<TSpace>> {
  const response = await fetch(workspacePath("/api/modules/work/tasks/spaces"));
  const data = await response.json().catch(() => ({})) as Partial<WorkPersonalHomeNavigationData<TSpace>> & { error?: string };
  if (!response.ok) throw new Error(data.error || "加载工作空间失败");
  return {
    spaces: data.spaces || [],
    preferredDepartmentIds: data.preferredDepartmentIds || [],
    preferredProjectIds: data.preferredProjectIds || [],
  };
}
