"use client";

import { useEffect, useState } from "react";
import { workspacePath } from "@workspace/core/routing";

export interface CompanyOption {
  value: string;
  label: string;
}

const cache = new Map<boolean, CompanyOption[]>();
const inflight = new Map<boolean, Promise<CompanyOption[]>>();

async function fetchCompanies(activeOnly: boolean): Promise<CompanyOption[]> {
  const url = activeOnly
    ? workspacePath("/api/settings/account/company-options?active=1")
    : workspacePath("/api/settings/account/company-options?active=0");
  const res = await fetch(url);
  if (!res.ok) throw new Error("公司选项加载失败");
  const data = await res.json() as { companies?: Array<{ code: string; name: string }> };
  const companies = (data.companies || []) as Array<{ code: string; name: string }>;
  return companies.map((company) => ({ value: company.code, label: company.name }));
}

function getCompanies(activeOnly: boolean): Promise<CompanyOption[]> {
  const cached = cache.get(activeOnly);
  if (cached) return Promise.resolve(cached);

  const existing = inflight.get(activeOnly);
  if (existing) return existing;

  const promise = fetchCompanies(activeOnly)
    .then((options) => {
      cache.set(activeOnly, options);
      return options;
    })
    .finally(() => inflight.delete(activeOnly));
  inflight.set(activeOnly, promise);
  return promise;
}

export function useCompanyOptions(activeOnly = true): CompanyOption[] {
  const [options, setOptions] = useState<CompanyOption[]>(cache.get(activeOnly) ?? []);

  useEffect(() => {
    getCompanies(activeOnly).then(setOptions).catch(() => {});
  }, [activeOnly]);

  return options;
}

export function getCachedCompanyOptions(activeOnly = true): CompanyOption[] {
  return cache.get(activeOnly) ?? [];
}
