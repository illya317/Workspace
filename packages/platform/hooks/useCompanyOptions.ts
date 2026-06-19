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
    ? workspacePath("/api/hr/companies?active=1")
    : workspacePath("/api/hr/companies");
  const res = await fetch(url);
  const data = await res.json();
  const companies = (data.companies || []) as Array<{ code: string; name: string }>;
  return companies.map((company) => ({ value: company.code, label: company.name }));
}

function getCompanies(activeOnly: boolean): Promise<CompanyOption[]> {
  const cached = cache.get(activeOnly);
  if (cached) return Promise.resolve(cached);

  const existing = inflight.get(activeOnly);
  if (existing) return existing;

  const promise = fetchCompanies(activeOnly).then((options) => {
    cache.set(activeOnly, options);
    inflight.delete(activeOnly);
    return options;
  });
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
