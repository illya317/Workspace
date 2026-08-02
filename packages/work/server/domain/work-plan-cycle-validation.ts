import { findOkrPlanForCycle } from "../work-plan-cycle-reference-adapter";

export async function validateSingleOkrPlanPerCycle(input: {
  targetType?: string | null;
  targetId?: number | string | null;
  kind?: string | null;
  okrCycleId?: number | null;
  currentPlanId?: number | null;
}) {
  const kind = input.kind || "okr";
  const okrCycleId = positiveId(input.okrCycleId);
  const targetId = positiveId(input.targetId);
  if (kind !== "okr" || !okrCycleId || !targetId) return null;
  const duplicate = await findOkrPlanForCycle({
    targetType: input.targetType || "department",
    targetId,
    okrCycleId,
    currentPlanId: input.currentPlanId,
  });
  return duplicate ? `该周期已存在计划：${duplicate.title}` : null;
}

function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
