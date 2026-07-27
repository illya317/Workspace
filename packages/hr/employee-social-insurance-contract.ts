export const EMPLOYEE_SOCIAL_INSURANCE_STATUSES = [
  "insured",
  "stopped",
  "uninsured",
  "retired",
] as const;

export type EmployeeSocialInsuranceStatus = typeof EMPLOYEE_SOCIAL_INSURANCE_STATUSES[number];

export const EMPLOYEE_SOCIAL_INSURANCE_STATUS_LABELS: Record<EmployeeSocialInsuranceStatus, string> = {
  insured: "已参保",
  stopped: "已停保",
  uninsured: "未参保",
  retired: "已退休",
};

export type EmployeeSocialInsuranceOperation = "register" | "transfer" | "stop" | "supplement-missing";
export type EmployeeSocialInsuranceField = "insuranceStatus" | "companyId" | "startMonth" | "endMonth" | "stopReason";

const REQUIRED_FIELDS: Record<
  EmployeeSocialInsuranceOperation,
  Partial<Record<EmployeeSocialInsuranceStatus, readonly EmployeeSocialInsuranceField[]>>
> = {
  register: {
    insured: ["insuranceStatus", "companyId", "startMonth"],
    stopped: ["insuranceStatus", "endMonth", "stopReason"],
    uninsured: ["insuranceStatus"],
    retired: ["insuranceStatus"],
  },
  transfer: {
    insured: ["companyId", "startMonth"],
  },
  stop: {
    stopped: ["endMonth", "stopReason"],
  },
  "supplement-missing": {},
};

export const EMPLOYEE_SOCIAL_INSURANCE_SUPPLEMENT_FIELDS = [
  "companyId",
  "startMonth",
  "endMonth",
  "stopReason",
] as const satisfies readonly EmployeeSocialInsuranceField[];

export function employeeSocialInsuranceFieldRequired(input: {
  operation: EmployeeSocialInsuranceOperation;
  status: EmployeeSocialInsuranceStatus;
  field: EmployeeSocialInsuranceField;
}) {
  return REQUIRED_FIELDS[input.operation][input.status]?.includes(input.field) ?? false;
}

export function employeeSocialInsuranceRegistrationCompany<
  T extends {
    companyId: number | null;
    companyName: string | null;
    startMonth: string | null;
    endMonth: string | null;
  },
>(rows: readonly T[]): Pick<T, "companyId" | "companyName"> | null {
  const candidates = rows.filter((row) => row.companyId != null && row.companyName);
  const dated = candidates
    .map((row, index) => ({ row, index, month: row.endMonth || row.startMonth }))
    .filter((item): item is typeof item & { month: string } => Boolean(item.month))
    .sort((left, right) => right.month.localeCompare(left.month) || left.index - right.index);
  const selected = dated[0]?.row ?? candidates[0] ?? null;
  return selected ? { companyId: selected.companyId, companyName: selected.companyName } : null;
}

const CURRENT_STATUS_PRIORITY: Record<EmployeeSocialInsuranceStatus, number> = {
  insured: 0,
  retired: 1,
  stopped: 2,
  uninsured: 3,
};

export function employeeSocialInsuranceCurrentStatus<
  T extends { insuranceStatus: EmployeeSocialInsuranceStatus },
>(rows: readonly T[]): T | null {
  return rows.reduce<T | null>((selected, row) => (
    !selected
    || CURRENT_STATUS_PRIORITY[row.insuranceStatus] < CURRENT_STATUS_PRIORITY[selected.insuranceStatus]
      ? row
      : selected
  ), null);
}

export const EMPLOYEE_SOCIAL_INSURANCE_BASELINE_POLICY = {
  persistence: "preload-authority",
  knownStatus: "persist",
  missingCompany: "nullable-with-quality-marker",
  missingMonth: "nullable-with-quality-marker",
  hardConflicts: "quarantine",
} as const;
