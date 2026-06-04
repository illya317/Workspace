"use client";

import { useState, useEffect } from "react";

export interface CompanyOption {
  value: string;
  label: string;
}

const cache = new Map<boolean, CompanyOption[]>();
const inflight = new Map<boolean, Promise<CompanyOption[]>>();

async function fetchCompanies(activeOnly: boolean): Promise<CompanyOption[]> {
  const url = activeOnly ? "/api/hr/companies?active=1" : "/api/hr/companies";
  const res = await fetch(url);
  const data = await res.json();
  const companies = (data.companies || []) as Array<{ code: string; name: string }>;
  return companies.map((c) => ({ value: c.code, label: c.name }));
}

function getCompanies(activeOnly: boolean): Promise<CompanyOption[]> {
  const cached = cache.get(activeOnly);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(activeOnly);
  if (existing) return existing;
  const promise = fetchCompanies(activeOnly).then((opts) => {
    cache.set(activeOnly, opts);
    inflight.delete(activeOnly);
    return opts;
  });
  inflight.set(activeOnly, promise);
  return promise;
}

/**
 * 动态加载公司列表作为 select 选项。
 * 数据来自 Company 表（唯一真相源）。
 * 多个组件实例共享同一请求（全局缓存）。
 */
export function useCompanyOptions(activeOnly = true): CompanyOption[] {
  const [options, setOptions] = useState<CompanyOption[]>(cache.get(activeOnly) ?? []);
  useEffect(() => {
    getCompanies(activeOnly).then(setOptions).catch(() => {});
  }, [activeOnly]);
  return options;
}

/** 同步获取已缓存的公司选项（首次调用前需有组件 mount 过 useCompanyOptions） */
export function getCachedCompanyOptions(activeOnly = true): CompanyOption[] {
  return cache.get(activeOnly) ?? [];
}
