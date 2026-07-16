import { randomBytes } from "crypto";

type EmployeeListInput = {
  employmentStatus?: "active" | "inactive";
  isActive?: string | null;
  company?: string;
  department?: string;
  position?: string;
  personnelType?: string;
  keyword: string;
  filterField?: string;
  filterValue?: string;
  page: number;
  pageSize: number;
};

type EmployeeListDiagnostics = {
  requestId: string; startedAt: number; startMemory: NodeJS.MemoryUsage; base: Record<string, unknown>;
};

function diagnosticsEnabled() {
  return process.env.NODE_ENV === "production" || process.env.HR_EMPLOYEE_LIST_DIAGNOSTICS === "1";
}

function toMiB(value: number) {
  return Math.round(value / 1024 / 1024);
}

export function startEmployeeListDiagnostics(input: EmployeeListInput, branch: "fast" | "slow"): EmployeeListDiagnostics | null {
  if (!diagnosticsEnabled()) return null;
  return {
    requestId: randomBytes(4).toString("hex"),
    startedAt: Date.now(),
    startMemory: process.memoryUsage(),
    base: {
      branch,
      page: input.page,
      pageSize: input.pageSize,
      employmentStatus: input.employmentStatus ?? null,
      isActive: input.isActive ?? null,
      hasKeyword: Boolean(input.keyword),
      keywordLength: input.keyword.length,
      hasCompany: Boolean(input.company),
      hasDepartment: Boolean(input.department),
      hasPosition: Boolean(input.position),
      personnelType: input.personnelType || null,
      filterField: input.filterField || null,
      hasFilterValue: Boolean(input.filterValue),
    },
  };
}

export function logEmployeeListDiagnostics(diagnostics: EmployeeListDiagnostics | null, step: string, extra: Record<string, unknown> = {}) {
  if (!diagnostics) return;
  const memory = process.memoryUsage();
  console.info("[hr.employees.list]", JSON.stringify({
    requestId: diagnostics.requestId,
    step,
    elapsedMs: Date.now() - diagnostics.startedAt,
    rssMiB: toMiB(memory.rss),
    heapUsedMiB: toMiB(memory.heapUsed),
    heapTotalMiB: toMiB(memory.heapTotal),
    externalMiB: toMiB(memory.external),
    arrayBuffersMiB: toMiB(memory.arrayBuffers),
    rssDeltaMiB: toMiB(memory.rss - diagnostics.startMemory.rss),
    heapUsedDeltaMiB: toMiB(memory.heapUsed - diagnostics.startMemory.heapUsed),
    ...diagnostics.base,
    ...extra,
  }));
}
