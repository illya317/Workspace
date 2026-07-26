export function validateWorkPlanAlignmentReplaceCommand(input: {
  childPlanId: number;
  alignment: {
    sourceType: "plan" | "objective" | "key_result";
    sourcePlanId: number | null;
    sourceWorkItemId: number | null;
  } | null | undefined;
}) {
  if (!Number.isInteger(input.childPlanId) || input.childPlanId <= 0) return "子计划无效";
  if (input.alignment === undefined || input.alignment === null) return null;
  if (input.alignment.sourceType === "plan") return input.alignment.sourcePlanId ? null : "上级计划无效";
  return input.alignment.sourceWorkItemId ? null : "对齐或上级目标无效";
}
