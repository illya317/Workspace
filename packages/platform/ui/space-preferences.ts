"use client";

import { requestJson, putJson } from "./api-client";

export interface PreferredDepartmentOption {
  id: number;
  name: string;
  code: string;
}

export interface PreferredDepartmentSettings {
  departments: PreferredDepartmentOption[];
  preferredDepartmentIds: number[];
  maxPreferredDepartments: number;
}

const PREFERRED_DEPARTMENTS_ENDPOINT = "/api/settings/account/preferred-departments";

export function fetchPreferredDepartmentSettings() {
  return requestJson<PreferredDepartmentSettings>(PREFERRED_DEPARTMENTS_ENDPOINT, {
    fallbackMessage: "加载常用部门失败",
  });
}

export function savePreferredDepartmentIds(departmentIds: number[]) {
  return putJson<{ success: true; preferredDepartmentIds: number[] }>(
    PREFERRED_DEPARTMENTS_ENDPOINT,
    { departmentIds },
    "保存常用部门失败",
  );
}
