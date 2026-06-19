export interface EnrichedContract {
  id: number;
  employeeId: string;
  employeeName: string;
  company?: string | null;
  contractType?: string | null;
  nearestEnd: string | null;
  daysLeft: number | null;
  status: "expired" | "expiring30" | "expiring90" | "active" | "permanent";
}

function isValidDate(d: string | null | undefined): boolean {
  if (!d) return false;
  const parsed = new Date(d);
  return !isNaN(parsed.getTime());
}

function daysUntil(d: string): number {
  const target = new Date(d).setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

interface RawContract {
  id: number;
  employeeId: string;
  employeeName: string;
  company?: string | null;
  contractType?: string | null;
  isPrimary?: boolean;
  permanentContractDate?: string | null;
  firstContractStartDate?: string | null;
  firstContractEndDate?: string | null;
  secondContractStartDate?: string | null;
  secondContractEndDate?: string | null;
  thirdContractStartDate?: string | null;
  thirdContractEndDate?: string | null;
  endDate?: string | null;
}

function hasPermanentContract(c: RawContract): boolean {
  return !!c.permanentContractDate && isValidDate(c.permanentContractDate);
}

function latestPeriod(c: RawContract): { start?: string | null; end?: string | null } | null {
  const periods = [
    { start: c.firstContractStartDate, end: c.firstContractEndDate },
    { start: c.secondContractStartDate, end: c.secondContractEndDate },
    { start: c.thirdContractStartDate, end: c.thirdContractEndDate },
  ];

  for (let i = periods.length - 1; i >= 0; i--) {
    const period = periods[i];
    if (isValidDate(period.start) || isValidDate(period.end)) return period;
  }
  return null;
}

function hasOpenEndedLatestPeriod(c: RawContract): boolean {
  if (isValidDate(c.endDate)) return false;
  const period = latestPeriod(c);
  return !!period && isValidDate(period.start) && !isValidDate(period.end);
}

function contractExpiryDate(c: RawContract): string | null {
  if (isValidDate(c.endDate)) return c.endDate ?? null;

  const period = latestPeriod(c);
  if (period) {
    if (isValidDate(period.start) && !isValidDate(period.end)) return null;
    if (isValidDate(period.end)) return period.end ?? null;
  }

  return null;
}

export function enrichContracts(contracts: RawContract[]): EnrichedContract[] {
  return contracts
    .filter((c) => c.isPrimary)
    .map((c): EnrichedContract => {
      if (hasPermanentContract(c) || hasOpenEndedLatestPeriod(c)) {
        return {
          id: c.id,
          employeeId: c.employeeId,
          employeeName: c.employeeName,
          company: c.company,
          contractType: c.contractType,
          nearestEnd: null,
          daysLeft: null,
          status: "permanent",
        };
      }
      const end = contractExpiryDate(c);
      const days = end ? daysUntil(end) : null;
      let status: EnrichedContract["status"] = "active";
      if (days !== null && !isNaN(days)) {
        if (days < 0) status = "expired";
        else if (days <= 30) status = "expiring30";
        else if (days <= 90) status = "expiring90";
      }
      return {
        id: c.id,
        employeeId: c.employeeId,
        employeeName: c.employeeName,
        company: c.company,
        contractType: c.contractType,
        nearestEnd: end,
        daysLeft: days,
        status,
      };
    })
    .sort((a, b) => {
      if (a.status === "expired" && b.status !== "expired") return -1;
      if (b.status === "expired" && a.status !== "expired") return 1;
      if (a.daysLeft === null && b.daysLeft === null) return a.employeeName.localeCompare(b.employeeName);
      if (a.daysLeft === null) return 1;
      if (b.daysLeft === null) return -1;
      return a.daysLeft - b.daysLeft;
    });
}

export const statusBadge = (s: string) => {
  switch (s) {
    case "expired":
      return "bg-red-100 text-red-700";
    case "expiring30":
      return "bg-rose-100 text-rose-700";
    case "expiring90":
      return "bg-amber-100 text-amber-700";
    case "permanent":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-emerald-100 text-emerald-700";
  }
};

export const statusLabel = (s: string) => {
  switch (s) {
    case "expired":
      return "已到期";
    case "expiring30":
      return "30天内到期";
    case "expiring90":
      return "90天内到期";
    case "permanent":
      return "无固定期限";
    default:
      return "有效";
  }
};

export interface ContractStats {
  total: number;
  expired: number;
  expiring30: number;
  expiring90: number;
  permanent: number;
  types: [string, number][];
  companies: [string, number][];
}

export function computeStats(enriched: EnrichedContract[]): ContractStats {
  const total = enriched.length;
  const expired = enriched.filter((c) => c.status === "expired").length;
  const expiring30 = enriched.filter((c) => c.status === "expiring30").length;
  const expiring90 = enriched.filter((c) => c.status === "expiring90").length;
  const permanent = enriched.filter((c) => c.status === "permanent").length;

  const typeMap = new Map<string, number>();
  enriched.forEach((c) => {
    const key = c.contractType || "未知";
    typeMap.set(key, (typeMap.get(key) || 0) + 1);
  });
  const types = [...typeMap.entries()].sort((a, b) => b[1] - a[1]);

  const companyMap = new Map<string, number>();
  enriched.forEach((c) => {
    const key = c.company || "未知";
    companyMap.set(key, (companyMap.get(key) || 0) + 1);
  });
  const companies = [...companyMap.entries()].sort((a, b) => b[1] - a[1]);

  return { total, expired, expiring30, expiring90, permanent, types, companies };
}

export function filterContracts(enriched: EnrichedContract[], filter: string, search: string): EnrichedContract[] {
  let list = enriched;
  if (filter === "expiring30") list = enriched.filter((c) => c.status === "expiring30");
  else if (filter === "expiring90") list = enriched.filter((c) => c.status === "expiring30" || c.status === "expiring90");
  else if (filter === "expired") list = enriched.filter((c) => c.status === "expired");

  if (search.trim()) {
    const q = search.toLowerCase();
    list = list.filter((c) =>
      c.employeeName.toLowerCase().includes(q) ||
      c.employeeId.toLowerCase().includes(q) ||
      (c.company || "").toLowerCase().includes(q),
    );
  }
  return list;
}
