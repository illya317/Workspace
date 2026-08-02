import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

import { requiredText, validYear } from "../domain/shared-validation";

export function buildBudgetVersionCreateCommand<T extends { year: number; name: string; type: string }>(
  input: T,
): DomainValidationResult<{ data: T }> {
  const year = validYear(input.year);
  if (!year.ok) return year;
  const name = requiredText(input.name, "name");
  if (!name.ok) return name;
  if (!["dept", "rd", "all"].includes(input.type)) return failCommand("预算版本类型无效", 400, "type");
  return okCommand({ data: { ...input, year: year.data, name: name.data } });
}
