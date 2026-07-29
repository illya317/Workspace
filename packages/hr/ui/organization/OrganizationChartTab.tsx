"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createPageBody,
  createStatusSection,
  createVisualizationSection,
  PageSurface,
} from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";

import type { RosterSurfaceTabBarProps } from "../roster-surface";
import {
  buildOrganizationChartVisual,
  type OrganizationChartDepartment,
} from "./organization-chart";
import type { OrganizationCodeConfig } from "../tabs/department-position/types";

const ORGANIZATION_CHART_COPY = {
  missingRootText: "尚未建立董事会组织层级",
  emptyText: "暂无组织架构数据",
};

export default function OrganizationChartTab({ surface }: { surface: RosterSurfaceTabBarProps }) {
  const [departments, setDepartments] = useState<OrganizationChartDepartment[]>([]);
  const [functionalPrefix, setFunctionalPrefix] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetch(workspacePath("/api/modules/hr/roster/departments?pageSize=500&summary=1"), {
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("组织架构加载失败");
      const payload = await response.json() as {
        departments?: OrganizationChartDepartment[];
        codeConfig?: OrganizationCodeConfig;
      };
      setDepartments(payload.departments ?? []);
      setFunctionalPrefix(payload.codeConfig?.department.functionalPrefix ?? null);
    }).catch((loadError: unknown) => {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "组织架构加载失败");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, []);

  const visual = useMemo(
    () => buildOrganizationChartVisual(departments, ORGANIZATION_CHART_COPY, functionalPrefix ?? ""),
    [departments, functionalPrefix],
  );
  const body = loading
    ? createPageBody([createStatusSection("organization-loading", {
      kind: "loading",
      content: "正在生成组织架构",
    })])
    : error
      ? createPageBody([createStatusSection("organization-error", {
        kind: "error",
        content: error,
      })])
      : createPageBody([
        createVisualizationSection("organization-chart", {
          kind: "chart",
          chart: {
            frame: {
              title: "组织架构图",
              subtitle: "展示治理线、一级事业部及职能平台直属部门；各层独立居中，密集层统一使用等尺寸竖向节点。",
            },
            visual,
          },
        }),
      ]);

  return <PageSurface kind="standard" tabbar={surface.tabbar} body={body} />;
}
