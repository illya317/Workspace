import { workspaceBusinessDate } from "../business-date";

export const agentBusinessDate = workspaceBusinessDate;

export function isAgentDateOnlyRangeActive(
  startDate: string | null,
  endDate: string | null,
  today: string,
) {
  return (!startDate || startDate <= today) && (!endDate || endDate >= today);
}

export function isAgentDateTimeEndActive(endDate: Date | null, today: string) {
  return !endDate || agentBusinessDate(endDate) >= today;
}
