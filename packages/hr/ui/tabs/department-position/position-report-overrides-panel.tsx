"use client";

import { createPanelSection, useFeedback, type BodySurfaceSectionSpec, type FormSurfaceItemSpec, type FormSurfaceRepeatableItemSpec, type ReferenceOption } from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HR_REFERENCE_OPTIONS_ENDPOINT } from "../../fk-keys";
import type { Position } from "./types";

type PlacementRow = {
  clientKey: string;
  id: number | null;
  companyId: number | null;
  companyName: string;
  departmentId: number | null;
  departmentPath: string;
  reportToPositionId: number | null;
  reportToPositionName: string;
  headcount: string;
  isActive: boolean;
  edpCount: number;
};

type PlacementApiRow = {
  id: number;
  companyId?: number | null;
  companyName?: string | null;
  companyCode?: string | null;
  departmentId: number;
  departmentPath?: string | null;
  departmentName?: string | null;
  reportToPositionId?: number | null;
  reportToPositionName?: string | null;
  headcount?: number | null;
  isActive?: boolean | null;
  edpCount?: number | null;
};

function newPlacementRow(index: number, clientKey = `new-${index}`): PlacementRow {
  return {
    clientKey,
    id: null,
    companyId: null,
    companyName: "",
    departmentId: null,
    departmentPath: "",
    reportToPositionId: null,
    reportToPositionName: "",
    headcount: "",
    isActive: true,
    edpCount: 0,
  };
}

function normalizeRows(rows: PlacementRow[]) {
  return rows.map((row) => ({
    companyId: row.companyId,
    departmentId: row.departmentId,
    reportToPositionId: row.reportToPositionId,
    headcount: row.headcount === "" ? null : Number(row.headcount),
    isActive: row.isActive,
  }));
}

async function readJsonSafely(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function usePositionReportOverridesSection(position: Position | null | undefined): BodySurfaceSectionSpec | null {
  const feedback = useFeedback();
  const [rows, setRows] = useState<PlacementRow[]>([]);
  const [baseline, setBaseline] = useState("[]");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const [pendingScrollKey, setPendingScrollKey] = useState<string | null>(null);
  const [newRowCounter, setNewRowCounter] = useState(0);
  const dirty = useMemo(() => JSON.stringify(normalizeRows(rows)) !== baseline, [baseline, rows]);

  const loadPlacements = useCallback(async (positionId: number, cancelled?: () => boolean) => {
    setLoading(true);
    try {
      const response = await fetch(workspacePath(`/api/modules/hr/roster/position-report-overrides?positionId=${encodeURIComponent(String(positionId))}`));
      const data = await readJsonSafely(response);
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "加载特殊汇报失败");
      if (cancelled?.()) return;
      const nextRows = (Array.isArray(data.overrides) ? data.overrides : []).map((row: PlacementApiRow) => ({
        clientKey: String(row.id),
        id: row.id,
        companyId: row.companyId ?? null,
        companyName: row.companyName || row.companyCode || "",
        departmentId: row.departmentId,
        departmentPath: row.departmentPath || row.departmentName || "",
        reportToPositionId: row.reportToPositionId ?? null,
        reportToPositionName: row.reportToPositionName || "",
        headcount: row.headcount == null ? "" : String(row.headcount),
        isActive: row.isActive ?? true,
        edpCount: row.edpCount ?? 0,
      }));
      setRows(nextRows);
      setBaseline(JSON.stringify(normalizeRows(nextRows)));
    } catch (loadError) {
      if (!cancelled?.()) feedback.error(loadError instanceof Error ? loadError.message : "加载特殊汇报失败");
    } finally {
      if (!cancelled?.()) setLoading(false);
    }
  }, [feedback]);

  useEffect(() => {
    if (!position?.id) {
      setRows([]);
      setBaseline("[]");
      setLoading(false);
      return;
    }
    let cancelled = false;
    void loadPlacements(position.id, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadPlacements, position?.id]);

  useEffect(() => {
    if (!pendingScrollKey) return;
    const node = rowRefs.current.get(pendingScrollKey);
    if (!node) return;
    setPendingScrollKey(null);
    node.scrollIntoView({ behavior: "smooth", block: "nearest" });
    window.setTimeout(() => {
      const focusable = node.querySelector<HTMLElement>("input,button,[tabindex]");
      focusable?.focus();
    }, 150);
  }, [pendingScrollKey, rows]);

  if (!position) return null;

  function updateRow(index: number, patch: Partial<PlacementRow>) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  async function savePlacements() {
    if (!position?.id) return;
    setSaving(true);
    try {
      const response = await fetch(workspacePath("/api/modules/hr/roster/position-report-overrides"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionId: position.id,
          overrides: normalizeRows(rows),
        }),
      });
      const data = await readJsonSafely(response);
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "保存特殊汇报失败");
      await loadPlacements(position.id);
      feedback.success("特殊汇报已保存");
    } catch (saveError) {
      feedback.error(saveError instanceof Error ? saveError.message : "保存特殊汇报失败");
    } finally {
      setSaving(false);
    }
  }

  async function removePlacement(index: number, row: PlacementRow) {
    const label = [row.companyName, row.departmentPath].filter(Boolean).join(" / ") || "这条特殊汇报";
    const ok = await feedback.confirmDelete({
      message: `确定删除「${label}」吗？删除后需要保存才会生效。`,
    });
    if (!ok) return;
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  const repeatableItems: FormSurfaceRepeatableItemSpec[] = rows.map((row, index) => {
    const items: FormSurfaceItemSpec[] = [
      {
        key: `company-${row.clientKey}`,
        label: "适用公司",
        required: true,
        spec: {
          valueType: "reference",
          control: "reference",
          state: saving ? "disabled" : "normal",
          options: { source: "remote", fkKey: "hr.company", endpoint: HR_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" },
        },
        value: row.companyId == null ? "" : String(row.companyId),
        displayValue: row.companyName,
        placeholder: "搜索适用公司",
        onChange: (_value, option) => {
          const reference = option as ReferenceOption | undefined;
          updateRow(index, {
            companyId: reference?.id ?? null,
            companyName: reference?.name || "",
          });
        },
      },
      {
        key: `department-${row.clientKey}`,
        label: "适用组织",
        required: true,
        spec: {
          valueType: "reference",
          control: "reference",
          state: saving ? "disabled" : "normal",
          options: { source: "remote", fkKey: "hr.department", endpoint: HR_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" },
        },
        value: row.departmentId == null ? "" : String(row.departmentId),
        displayValue: row.departmentPath,
        placeholder: "搜索适用组织",
        onChange: (_value, option) => {
          const reference = option as ReferenceOption | undefined;
          updateRow(index, {
            departmentId: reference?.id ?? null,
            departmentPath: reference?.name || "",
            reportToPositionId: null,
            reportToPositionName: "",
          });
        },
      },
      {
        key: `reportTo-${row.clientKey}`,
        label: "上级岗位",
        spec: {
          valueType: "reference",
          control: "reference",
          state: saving || !row.departmentId ? "disabled" : "normal",
          options: {
            source: "remote",
            fkKey: "hr.position.inDepartment",
            endpoint: HR_REFERENCE_OPTIONS_ENDPOINT,
            returnField: "id",
            queryParams: { departmentId: row.departmentId },
          },
        },
        value: row.reportToPositionId == null ? "" : String(row.reportToPositionId),
        displayValue: row.reportToPositionName,
        placeholder: row.departmentId ? "搜索上级岗位" : "先选择适用组织",
        onChange: (_value, option) => {
          const reference = option as ReferenceOption | undefined;
          updateRow(index, {
            reportToPositionId: reference?.id ?? null,
            reportToPositionName: reference?.name || "",
          });
        },
      },
      {
        key: `headcount-${row.clientKey}`,
        label: "编制",
        spec: { valueType: "number", control: "text", state: saving ? "disabled" : "normal", validation: { min: 0 } },
        value: row.headcount,
        inputMode: "numeric",
        onChange: (value) => updateRow(index, { headcount: String(value ?? "").replace(/\D/g, "") }),
      },
    ];
    return {
      key: row.clientKey,
      itemRef: (node: HTMLDivElement | null) => {
        if (node) rowRefs.current.set(row.clientKey, node);
        else rowRefs.current.delete(row.clientKey);
      },
      title: (
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{[row.companyName, row.departmentPath].filter(Boolean).join(" / ") || "未选择适用范围"}</span>
          {!row.isActive ? (
            <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">已停用</span>
          ) : null}
        </span>
      ),
      subtitle: row.edpCount > 0 ? `已有任职 ${row.edpCount} 条` : undefined,
      items,
      actions: [
        {
          key: "save",
          label: saving ? "保存中..." : "保存",
          icon: "save" as const,
          variant: "primary" as const,
          disabled: loading || saving || !dirty,
          onClick: (): void => void savePlacements(),
        },
        {
          key: "toggle-active",
          label: row.isActive ? "停用" : "启用",
          icon: row.isActive ? "archive" as const : "restore" as const,
          variant: row.isActive ? "danger" as const : "secondary" as const,
          disabled: saving,
          onClick: (): void => updateRow(index, { isActive: !row.isActive }),
        },
        {
          key: "remove",
          label: "移除",
          icon: "delete" as const,
          variant: "danger" as const,
          disabled: saving,
          onClick: (): void => void removePlacement(index, row),
        },
      ],
    };
  });

  return createPanelSection("position-report-overrides", {
    title: "特殊汇报",
    actions: [
      {
        key: "add",
        label: "添加",
        icon: "add" as const,
        disabled: loading || saving,
        onClick: () => {
          const key = `new-${newRowCounter}`;
          setPendingScrollKey(key);
          setNewRowCounter((current) => current + 1);
          setRows((current) => [...current, newPlacementRow(current.length, key)]);
        },
      },
    ],
    sections: [{
      key: "position-report-override-form",
      body: {
        kind: "form",
        form: {
          kind: "fields",
          content: {
            items: [
              {
                kind: "repeatable",
                key: "overrides",
                items: repeatableItems,
                layout: { columns: 2 },
                empty: loading ? "加载中..." : "暂无特殊汇报",
              },
            ],
          },
        },
      },
    }],
  });
}
