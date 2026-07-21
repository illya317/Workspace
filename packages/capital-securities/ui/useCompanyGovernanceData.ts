"use client";

import { useCallback, useEffect, useState } from "react";
import { requestJson } from "@workspace/platform/ui/api-client";
import type { CompanyRecord, CompanyRelationRecord } from "../types";

type CompanyResponse = { companies: CompanyRecord[]; total: number };
type RelationResponse = { relations: CompanyRelationRecord[]; total: number };

export function useCompanyGovernanceData(view: "companies" | "relations", keyword: string) {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [relations, setRelations] = useState<CompanyRelationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const companyParams = new URLSearchParams({ page: "1", pageSize: "500" });
      if (view === "companies" && keyword) companyParams.set("keyword", keyword);
      const companyResponse = await requestJson<CompanyResponse>(
        `/api/modules/capitalSecurities/governance/companies?${companyParams.toString()}`,
        { fallbackMessage: "读取公司信息失败" },
      );
      setCompanies(companyResponse.companies);

      if (view === "companies") {
        setRelations([]);
        setTotal(companyResponse.total);
        return;
      }

      const relationParams = new URLSearchParams({ page: "1", pageSize: "500" });
      if (keyword) relationParams.set("keyword", keyword);
      const relationResponse = await requestJson<RelationResponse>(
        `/api/modules/capitalSecurities/governance/company-relations?${relationParams.toString()}`,
        { fallbackMessage: "读取股权关系失败" },
      );
      setRelations(relationResponse.relations);
      setTotal(relationResponse.total);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取公司治理资料失败");
    } finally {
      setLoading(false);
    }
  }, [keyword, view]);

  useEffect(() => { void load(); }, [load]);

  return { companies, relations, total, loading, error, load };
}
