type WorkflowNodeConditionFieldKind = "company" | "department";
type WorkflowNodeCondition = {
  fieldKind: WorkflowNodeConditionFieldKind;
  value: string | null;
};

export function workflowBranchConditionsMatchPayload<TPayload>(
  conditions: readonly WorkflowNodeCondition[],
  payload: TPayload,
) {
  return conditions.some((condition) => condition.value) && workflowConditionsMatchPayload(conditions, payload);
}

function workflowConditionsMatchPayload<TPayload>(
  conditions: readonly WorkflowNodeCondition[],
  payload: TPayload,
) {
  const grouped = new Map<WorkflowNodeConditionFieldKind, string[]>();
  for (const condition of conditions) {
    if (!condition.value) continue;
    const values = grouped.get(condition.fieldKind) ?? [];
    values.push(condition.value);
    grouped.set(condition.fieldKind, values);
  }
  if (grouped.size === 0) return true;
  for (const [fieldKind, expectedValues] of grouped.entries()) {
    const actualValues = collectWorkflowPayloadFieldValues(payload, fieldKind);
    if (!expectedValues.some((expected) => actualValues.has(expected))) return false;
  }
  return true;
}

function collectWorkflowPayloadFieldValues(payload: unknown, fieldKind: WorkflowNodeConditionFieldKind) {
  const values = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value as Record<string, unknown>;
    if (fieldKind === "company") {
      collectRecordValue(record, values, ["company", "companyCode", "companyId", "targetCompany", "targetCompanyCode", "targetCompanyId"]);
      if (record.targetType === "company") collectScalar(values, record.targetId);
    } else {
      collectRecordValue(record, values, ["department", "departmentId", "parentId", "targetDepartment", "targetDepartmentId"]);
      if (record.targetType === "department") collectScalar(values, record.targetId);
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(payload);
  return values;
}

function collectRecordValue(record: Record<string, unknown>, values: Set<string>, keys: string[]) {
  for (const key of keys) collectScalar(values, record[key]);
}

function collectScalar(values: Set<string>, value: unknown) {
  if (value === null || value === undefined || value === "") return;
  if (typeof value === "string" || typeof value === "number") values.add(String(value));
}
