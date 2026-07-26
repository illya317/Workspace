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

export interface PreferredProjectOption {
  id: number;
  name: string;
  code: string | null;
  projectLevel: string | null;
}

export interface PreferredProjectSettings {
  projects: PreferredProjectOption[];
  preferredProjectIds: number[];
  maxPreferredProjects: number;
}

const PREFERRED_DEPARTMENTS_ENDPOINT = "/api/settings/account/preferred-departments";
const PREFERRED_PROJECTS_ENDPOINT = "/api/settings/account/preferred-projects";

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

export function fetchPreferredProjectSettings() {
  return requestJson<PreferredProjectSettings>(PREFERRED_PROJECTS_ENDPOINT, {
    fallbackMessage: "加载常用项目失败",
  });
}

export function savePreferredProjectIds(projectIds: number[]) {
  return putJson<{ success: true; preferredProjectIds: number[] }>(
    PREFERRED_PROJECTS_ENDPOINT,
    { projectIds },
    "保存常用项目失败",
  );
}
