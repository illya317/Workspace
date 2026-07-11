import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

export const MAX_PREFERRED_PROJECTS = 3;

export interface PreferredProjectPreferenceCommand {
  projectIds: number[];
}

export function buildPreferredProjectPreferenceCommand(
  projectIds: number[],
  availableProjectIds: ReadonlySet<number>,
): DomainValidationResult<PreferredProjectPreferenceCommand> {
  const nextIds = Array.from(new Set(projectIds))
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, MAX_PREFERRED_PROJECTS);
  if (nextIds.some((id) => !availableProjectIds.has(id))) {
    return failCommand("不能选择不可见或未启用工作空间的项目");
  }
  return okCommand({ projectIds: nextIds });
}
