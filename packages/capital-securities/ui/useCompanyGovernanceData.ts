"use client";

import { useCallback, useEffect, useState } from "react";
import { requestJson } from "@workspace/platform/ui/api-client";
import type { CompanyRecord, OwnershipInterestRecord } from "../types";

type CompanyResponse = { companies: CompanyRecord[]; total: number };
type OwnershipResponse = { interests: OwnershipInterestRecord[]; total: number };

export function useCompanyGovernanceData(keyword: string, includeOwnership = true) {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [ownershipInterests, setOwnershipInterests] = useState<OwnershipInterestRecord[]>([]);
  const [companyTotal, setCompanyTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (keywordOverride?: string) => {
    setLoading(true);
    setError(null);
    try {
      const companyParams = new URLSearchParams({ page: "1", pageSize: "500" });
      const ownershipParams = new URLSearchParams({ page: "1", pageSize: "500" });
      const effectiveKeyword = keywordOverride ?? keyword;
      if (effectiveKeyword) companyParams.set("keyword", effectiveKeyword);
      const [companyResponse, ownershipResponse] = await Promise.all([
        requestJson<CompanyResponse>(
          `/api/modules/capitalSecurities/governance/companies?${companyParams.toString()}`,
          { fallbackMessage: "读取公司信息失败" },
        ),
        includeOwnership
          ? requestJson<OwnershipResponse>(
              `/api/modules/capitalSecurities/governance/ownership-interests?${ownershipParams.toString()}`,
              { fallbackMessage: "读取股权关系失败" },
            )
          : Promise.resolve({ interests: [], total: 0 }),
      ]);
      setCompanies(companyResponse.companies);
      setOwnershipInterests(ownershipResponse.interests);
      setCompanyTotal(companyResponse.total);
      return { companies: companyResponse.companies, ownershipInterests: ownershipResponse.interests };
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取公司治理资料失败");
    } finally {
      setLoading(false);
    }
  }, [includeOwnership, keyword]);

  useEffect(() => { void load(); }, [load]);

  return { companies, ownershipInterests, companyTotal, loading, error, load };
}
