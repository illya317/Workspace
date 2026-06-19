"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { workspacePath } from "@workspace/core/routing";
import {
  ActionButton,
  ActionToolbar,
  DataTable,
  DisclosureRecordCard,
  EmptyStateCard,
  MetricCard,
  PageContent,
  PanelCard,
  StatusBadge,
  TabBar,
  useConfirmDelete,
  type DataTableColumn,
} from "@workspace/core/ui";
import { hrCanEdit, type HRUser } from "@workspace/hr/types";
import {
  contractFields,
  edpFields,
  employeeFields,
  employeeProjectFields,
  employmentFields,
} from "@workspace/hr/constants";
import { ProfileFieldInput, SectionShell } from "./ProfileFormControls";
import type {
  ContractRow,
  EdpRow,
  EmployeeProfile,
  EmployeeProfileEmployee,
  EmployeeProjectRow,
  EmploymentRow,
  ProfileField,
} from "@workspace/hr/types";
import type { SearchOption } from "../components/EntitySearchInput";
import { validateChineseIdNumber } from "@workspace/hr/utils/identity";

type EditableRecord = Record<string, unknown> & { id?: number; isNew?: boolean };
type RowBase = { id?: number; isNew?: boolean };
type ProfileSection = "basic" | "employment" | "edp" | "project" | "history";

interface ProfileHistoryEntry {
  id: number;
  entityType: string;
  entityId: string;
  version: number;
  editorName: string;
  createdAt: string;
  changes: Array<{ field: string; label: string; from: string; to: string }>;
}

function toInputDate(value: unknown) {
  if (!value) return null;
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

function normalizeValue(value: unknown) {
  if (value === undefined || value === "") return null;
  return value;
}

function valuesEqual(left: unknown, right: unknown) {
  return normalizeValue(left) === normalizeValue(right);
}

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function isCurrentByEndDate(endDate: unknown) {
  const value = normalizeValue(endDate);
  return !value || String(value) >= todayText();
}

function parseWorkPercent(value: unknown) {
  const normalized = normalizeValue(value);
  if (normalized === null) return null;
  const text = String(normalized).trim();
  const numberText = text.endsWith("%") ? text.slice(0, -1).trim() : text;
  const parsed = Number(numberText);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return text.endsWith("%") ? parsed / 100 : parsed;
}

function validateCurrentWorkPercent(rows: EdpRow[]) {
  const currentRows = rows.filter((row) => isCurrentByEndDate(row.endDate));
  if (currentRows.length === 0) return { ok: true, message: "" };
  const values = currentRows.map((row) => parseWorkPercent(row.workPercent));
  if (values.some((value) => value === null || Number.isNaN(value))) {
    return { ok: false, message: "当前岗位工作占比未完整填写。" };
  }
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  if (Math.abs(total - 1) > 0.0001) {
    return { ok: false, message: "当前岗位工作占比合计不正确。" };
  }
  return { ok: true, message: "" };
}

function formatAlias(value: string | null) {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).join("、") : value;
  } catch {
    return value;
  }
}

async function requestJson(url: string, init?: RequestInit) {
  const res = await fetch(workspacePath(url), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

async function updateChangedFields(
  endpoint: string,
  id: number,
  original: EditableRecord,
  draft: EditableRecord,
  fields: ProfileField[],
) {
  for (const field of fields) {
    if (field.readOnly) continue;
    const next = normalizeValue(draft[field.key]);
    const prev = normalizeValue(original[field.key]);
    if (valuesEqual(next, prev)) continue;
    await requestJson(`${endpoint}/${id}`, {
      method: "PUT",
      body: JSON.stringify({ field: field.key, value: next }),
    });
  }
}

function applyDateFields<T extends EditableRecord>(item: T, fields: ProfileField[]): T {
  const next = { ...item } as EditableRecord;
  for (const field of fields) {
    if (field.type === "date") next[field.key] = toInputDate(next[field.key]);
  }
  return next as T;
}

function fieldGrid(
  fields: ProfileField[],
  record: EditableRecord,
  disabled: boolean,
  onChange: (key: string, value: unknown, option?: SearchOption) => void,
  isFieldDisabled?: (field: ProfileField, record: EditableRecord) => boolean,
) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {fields.map((field) => {
        const disabledByStatus = record.isActive === true && (field.key === "leaveDate" || field.key === "leaveReason" || field.key === "leaveNote");
        const disabledByRule = isFieldDisabled?.(field, record) ?? false;
        return (
          <label
            key={field.key}
            className={field.span === "wide" ? "md:col-span-2 xl:col-span-3" : undefined}
          >
            <span className="mb-1 block text-xs font-medium text-slate-500">
              {field.label}{field.required ? " *" : ""}
            </span>
            <ProfileFieldInput
              field={field}
              value={field.type === "lunarBirthday" ? record.birthDate : record[field.key]}
              displayValue={field.displayKey ? String(record[field.displayKey] || "") : undefined}
              disabled={disabled || field.readOnly || disabledByStatus || disabledByRule}
              onChange={onChange}
            />
          </label>
        );
      })}
    </div>
  );
}

function normalizeForDirty(value: unknown): unknown {
  if (value === undefined || value === "") return null;
  if (Array.isArray(value)) return value.map((item) => normalizeForDirty(item));
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["departmentName", "departmentPath", "positionName", "employeeName", "projectName", "projectType", "isNew"].includes(key))
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([key, item]) => [key, normalizeForDirty(item)]));
  }
  return value;
}

function sameDraft(left: unknown, right: unknown) {
  return JSON.stringify(normalizeForDirty(left)) === JSON.stringify(normalizeForDirty(right));
}

export default function EmployeeProfileClient({
  employeeId,
  user,
}: {
  employeeId: string;
  user: HRUser;
}) {
  const router = useRouter();
  const confirmDelete = useConfirmDelete();
  const canEdit = hrCanEdit(user);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [employeeDraft, setEmployeeDraft] = useState<EmployeeProfileEmployee | null>(null);
  const [employments, setEmployments] = useState<EmploymentRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [edps, setEdps] = useState<EdpRow[]>([]);
  const [employeeProjects, setEmployeeProjects] = useState<EmployeeProjectRow[]>([]);
  const [historyEntries, setHistoryEntries] = useState<ProfileHistoryEntry[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<ProfileSection>("basic");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(workspacePath(`/api/hr/employee-profiles/${employeeId}`));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `加载失败 (${res.status})`);
      const nextProfile = data as EmployeeProfile;
      setProfile(nextProfile);
      setEmployeeDraft(applyDateFields(nextProfile.employee as unknown as EditableRecord, employeeFields) as unknown as EmployeeProfileEmployee);
      setEmployments(nextProfile.employments.map((item) => applyDateFields(item as unknown as EditableRecord, employmentFields) as unknown as EmploymentRow));
      setContracts(nextProfile.contracts.map((item) => applyDateFields(item as unknown as EditableRecord, contractFields) as unknown as ContractRow));
      setEdps(nextProfile.edps.map((item) => applyDateFields(item as unknown as EditableRecord, edpFields) as unknown as EdpRow));
      setEmployeeProjects(nextProfile.employeeProjects.map((item) => applyDateFields(item as unknown as EditableRecord, employeeProjectFields) as unknown as EmployeeProjectRow));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setError(null);
    try {
      const res = await fetch(workspacePath(`/api/hr/employee-profiles/${employeeId}/history`));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `历史记录加载失败 (${res.status})`);
      setHistoryEntries(data.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "历史记录加载失败");
    } finally {
      setHistoryLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    if (activeSection === "history") void loadHistory();
  }, [activeSection, loadHistory]);

  const headerFacts = useMemo(() => {
    if (!profile) return [];
    return [
      { label: "状态", value: profile.summary.status || "-" },
      { label: "公司", value: profile.summary.currentCompany || "-" },
      { label: "部门", value: profile.summary.departmentName || "-" },
      { label: "岗位", value: profile.summary.positionName || "-" },
    ];
  }, [profile]);

  const dirtyState = useMemo(() => {
    const basic = Boolean(profile && employeeDraft && !sameDraft(employeeDraft, profile.employee));
    const employment = Boolean(profile && (!sameDraft(employments, profile.employments) || !sameDraft(contracts, profile.contracts)));
    const edp = Boolean(profile && !sameDraft(edps, profile.edps));
    const project = Boolean(profile && !sameDraft(employeeProjects, profile.employeeProjects));
    return {
      basic,
      employment,
      edp,
      project,
      all: basic || employment || edp || project,
    };
  }, [contracts, edps, employeeDraft, employeeProjects, employments, profile]);

  function showMessage(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 2600);
  }

  function validateBasicDraft() {
    const idNumberResult = validateChineseIdNumber(employeeDraft?.idNumber);
    if (!idNumberResult.ok) return idNumberResult.error;
    return null;
  }

  async function persistBasic() {
    if (!profile || !employeeDraft) return;
    const validationError = validateBasicDraft();
    if (validationError) throw new Error(validationError);
    await updateChangedFields(
      "/api/hr/employees",
      profile.employee.id,
      profile.employee as unknown as EditableRecord,
      employeeDraft as unknown as EditableRecord,
      employeeFields,
    );
  }

  async function persistEmployment(row: EmploymentRow) {
    if (!profile) return;
    const normalizedRow = row.isActive ? { ...row, leaveDate: null, leaveReason: null, leaveNote: null } : row;
    if (row.isNew) {
      await requestJson("/api/hr/employments", {
        method: "POST",
        body: JSON.stringify({
          employeeId: profile.employee.id,
          isActive: normalizedRow.isActive,
          joinDate: normalizedRow.joinDate,
          leaveDate: normalizedRow.leaveDate,
          leaveReason: normalizedRow.leaveReason,
          leaveNote: normalizedRow.leaveNote,
          officeLocation: normalizedRow.officeLocation,
          personnelType: normalizedRow.personnelType,
          rank: normalizedRow.rank,
          title: normalizedRow.title,
        }),
      });
    } else if (row.id) {
      const original = profile.employments.find((item) => item.id === row.id);
      if (original) {
        await updateChangedFields(
          "/api/hr/employments",
          row.id,
          original as unknown as EditableRecord,
          normalizedRow as unknown as EditableRecord,
          employmentFields,
        );
      }
    }
  }

  function serializeContract(row: ContractRow) {
    const normalizedRow = normalizeContractRow(row);
    return Object.fromEntries(
      contractFields.map((field) => [field.key, normalizeValue(normalizedRow[field.key as keyof ContractRow])]),
    );
  }

  async function persistContracts(rows: ContractRow[]) {
    if (!profile) return;
    await requestJson(`/api/hr/employee-profiles/${profile.employee.id}/contracts`, {
      method: "PUT",
      body: JSON.stringify({
        rows: rows.map((row) => ({
          id: row.id ?? null,
          employmentId: row.employmentId ?? null,
          ...serializeContract(row),
        })),
      }),
    });
  }

  async function persistEdps(rows: EdpRow[]) {
    if (!profile) return;
    const percentCheck = validateCurrentWorkPercent(rows);
    if (!percentCheck.ok) {
      throw new Error(percentCheck.message);
    }
    await requestJson(`/api/hr/employee-profiles/${profile.employee.id}/edps`, {
      method: "PUT",
      body: JSON.stringify({ rows }),
    });
  }

  async function persistEmployeeProjects(rows: EmployeeProjectRow[]) {
    if (!profile) return;
    if (rows.some((row) => !row.projectId)) throw new Error("请选择项目");
    await requestJson(`/api/hr/employee-profiles/${profile.employee.id}/projects`, {
      method: "PUT",
      body: JSON.stringify({ rows }),
    });
  }

  async function runSave(savingKey: string, task: () => Promise<void>, successMessage: string) {
    setSaving(savingKey);
    setError(null);
    try {
      await task();
      await load();
      showMessage(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(null);
    }
  }

  async function saveBasic() {
    await runSave("basic", persistBasic, "基本信息已保存");
  }

  async function saveEmployments() {
    await runSave("employment", async () => {
      for (const row of employments) await persistEmployment(row);
      await persistContracts(contracts);
    }, "雇佣关系已保存");
  }

  async function saveEdps() {
    await runSave("edp", async () => persistEdps(edps), "部门岗位已保存");
  }

  async function saveEmployeeProjects() {
    await runSave("project", async () => persistEmployeeProjects(employeeProjects), "项目记录已保存");
  }

  async function saveAll() {
    await runSave("all", async () => {
      await persistBasic();
      for (const row of employments) await persistEmployment(row);
      await persistContracts(contracts);
      await persistEdps(edps);
      await persistEmployeeProjects(employeeProjects);
    }, "员工资料已全部保存");
  }

  function updateEmployeeField(key: string, value: unknown, option?: SearchOption) {
    setEmployeeDraft((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value } as EmployeeProfileEmployee;
      if (key === "userId") {
        next.userName = option?.name ?? null;
        next.username = option?.subtitle ?? null;
      }
      return next;
    });
  }

  function updateRow<T extends RowBase>(
    rows: T[],
    index: number,
    field: ProfileField,
    value: unknown,
    option?: SearchOption,
  ) {
    return rows.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, [field.key]: value } as EditableRecord;
      if (field.displayKey) next[field.displayKey] = option?.name ?? null;
      if (field.key === "positionId") {
        next.departmentId = option?.departmentId ?? null;
        next.departmentPath = option?.departmentPath ?? null;
        next.departmentName = option?.departmentPath ?? null;
      }
      return next as T;
    });
  }

  if (loading) {
    return (
      <PageContent>
        <EmptyStateCard>加载员工资料...</EmptyStateCard>
      </PageContent>
    );
  }

  if (!profile || !employeeDraft) {
    return (
      <PageContent>
        <EmptyStateCard compact>{error || "员工资料不存在"}</EmptyStateCard>
      </PageContent>
    );
  }

  const aliasText = formatAlias(profile.employee.alias);

  return (
    <PageContent>
      <PanelCard className="mb-5" bodyClassName="p-5">
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusBadge label={profile.employee.employeeId} variant="gray" />
              <StatusBadge label={profile.summary.status || "未设置状态"} variant="green" />
              {!canEdit && (
                <StatusBadge label="只读" variant="yellow" />
              )}
            </div>
            <h1 className="text-2xl font-semibold text-slate-950">{profile.employee.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {aliasText || "无别名"} · {profile.employee.title || "未设置职称"}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {headerFacts.map((fact) => (
              <MetricCard key={fact.label} label={fact.label} value={fact.value} />
            ))}
          </div>
        </div>
      </PanelCard>

      <ActionToolbar
        className="sticky top-[52px] z-20 mb-5"
        leftSlot={(
          <TabBar
            tabs={[
              { key: "basic", label: "基本信息" },
              { key: "employment", label: "雇佣关系" },
              { key: "edp", label: "部门岗位" },
              { key: "project", label: "项目" },
              { key: "history", label: "历史记录" },
            ]}
            active={activeSection}
            onChange={(key) => setActiveSection(key as ProfileSection)}
            className="mb-0"
          />
        )}
        primaryActions={canEdit && activeSection !== "history" ? [{
          label: saving === "all" ? "保存中..." : "保存全部",
          disabled: saving !== null || !dirtyState.all,
          onClick: saveAll,
        }] : []}
        secondaryActions={[{
          label: "返回列表",
          onClick: () => router.push("/hr/roster"),
        }]}
      />

      {error && <EmptyStateCard compact>{error}</EmptyStateCard>}
      {message && <EmptyStateCard compact>{message}</EmptyStateCard>}

      <div className="space-y-5">
        {activeSection === "basic" && (
          <SectionShell
            title="基本信息"
            subtitle="员工自身资料和关联 Workspace 账号。"
            actions={canEdit ? (
          <ActionButton
            disabled={saving !== null || !dirtyState.basic}
            onClick={saveBasic}
            variant="primary"
          >
            {saving === "basic" ? "保存中..." : "保存基本信息"}
          </ActionButton>
            ) : null}
          >
            {fieldGrid(employeeFields, employeeDraft as unknown as EditableRecord, !canEdit, updateEmployeeField)}
          </SectionShell>
        )}

        {activeSection === "employment" && (
          <EmploymentSection
            employment={employments.find((row) => row.isActive) ?? employments[0] ?? null}
            primaryContract={
              contracts.find((row) => row.isPrimary) ??
              contracts.find((row) => row.company && row.company === profile.summary.currentCompany) ??
              contracts[0] ??
              null
            }
            canEdit={canEdit}
            saving={saving}
            onSaveAll={saveEmployments}
            dirty={dirtyState.employment}
            onChange={(field, value, option) => setEmployments((rows) => {
              const index = rows.findIndex((row) => row.isActive) >= 0 ? rows.findIndex((row) => row.isActive) : 0;
              if (index < 0) return rows;
              const nextRows = updateRow(rows as unknown as EditableRecord[], index, field, value, option) as unknown as EmploymentRow[];
              if (field.key !== "isActive" || value !== true) return nextRows;
              return nextRows.map((row, rowIndex) => rowIndex === index ? { ...row, leaveDate: null, leaveReason: null, leaveNote: null } : row);
            })}
            contracts={contracts}
            onAddContract={() => setContracts((rows) => [
              {
                employmentId: employments.find((row) => row.isActive)?.id ?? employments[0]?.id,
                employeeId: profile.employee.employeeId,
                employeeName: profile.employee.name,
                company: profile.summary.currentCompany || "",
                isPrimary: false,
                isInsuredHere: false,
                insuranceStatus: null,
                legalRelation: "",
                contractType: "",
                employmentForm: "",
                firstContractStartDate: null,
                firstContractEndDate: null,
                secondContractStartDate: null,
                secondContractEndDate: null,
                thirdContractStartDate: null,
                thirdContractEndDate: null,
                permanentContractDate: null,
                confidentialityDate: null,
                nonCompeteDate: null,
                endDate: null,
                isNew: true,
              },
              ...rows,
            ])}
            onChangeContract={(index, field, value, option) => setContracts((rows) => {
              const nextRows = updateRow(rows as unknown as EditableRecord[], index, field, value, option) as unknown as ContractRow[];
              if (field.key !== "isPrimary" || value !== true) return nextRows;
              return nextRows.map((row, rowIndex) => rowIndex === index ? row : { ...row, isPrimary: false });
            })}
            onDeleteContract={async (row, index) => {
              const ok = await confirmDelete({
                message: `确定删除这条合同记录${row.company ? `（${row.company}）` : ""}吗？删除后需要保存才会生效。`,
              });
              if (!ok) return;
              setContracts((rows) => rows.filter((_, i) => i !== index));
            }}
          />
        )}

        {activeSection === "edp" && (
          <EdpSection
            rows={edps}
            canEdit={canEdit}
            saving={saving}
            onSaveAll={saveEdps}
            dirty={dirtyState.edp}
            onAdd={() => setEdps((rows) => [
              {
                employeeId: profile.employee.id,
                departmentId: null,
                departmentName: null,
                departmentPath: null,
                positionId: null,
                positionName: null,
                isPrimary: false,
                startDate: null,
                endDate: null,
                reportTo: null,
                workPercent: null,
                isNew: true,
              },
              ...rows,
            ])}
            onChange={(index, field, value, option) => setEdps((rows) => updateRow(rows as unknown as EditableRecord[], index, field, value, option) as unknown as EdpRow[])}
            onDelete={async (row, index) => {
              const ok = await confirmDelete({
                message: `确定删除这条岗位记录${row.positionName ? `（${row.positionName}）` : ""}吗？删除后需要保存才会生效。`,
              });
              if (!ok) return;
              const nextRows = edps.filter((_, i) => i !== index);
	              const percentCheck = validateCurrentWorkPercent(nextRows);
	              if (!percentCheck.ok) {
	                setError(percentCheck.message);
	                return;
	              }
              setEdps((rows) => rows.filter((_, i) => i !== index));
            }}
          />
        )}

        {activeSection === "project" && (
          <RowsSection
            title="项目"
            subtitle="员工参与项目的角色和日期；请在“项目”页面维护项目人员。"
            rows={employeeProjects}
            fields={employeeProjectFields}
            canEdit={false}
            saving={saving}
            addLabel="新增项目员工记录"
            onSaveAll={saveEmployeeProjects}
            dirty={dirtyState.project}
            onAdd={() => setEmployeeProjects((rows) => [
              {
                employeeId: profile.employee.id,
                projectId: null,
                projectName: null,
                projectType: null,
                role: null,
                startDate: null,
                endDate: null,
                isNew: true,
              },
              ...rows,
            ])}
            onChange={(index, field, value, option) => setEmployeeProjects((rows) => updateRow(rows as unknown as EditableRecord[], index, field, value, option) as unknown as EmployeeProjectRow[])}
            onDelete={async (row, index) => {
              const ok = await confirmDelete({
                message: `确定删除这条项目记录${row.projectName ? `（${row.projectName}）` : ""}吗？删除后需要保存才会生效。`,
              });
              if (!ok) return;
              setEmployeeProjects((rows) => rows.filter((_, i) => i !== index));
            }}
            allowDelete
          />
        )}

        {activeSection === "history" && (
          <HistorySection
            entries={historyEntries}
            loading={historyLoading}
            expandedId={expandedHistoryId}
            onToggle={(id) => setExpandedHistoryId((current) => (current === id ? null : id))}
            onRefresh={loadHistory}
          />
        )}
      </div>
    </PageContent>
  );
}

function RowsSection<T extends RowBase>({
  title,
  subtitle,
  rows,
  fields,
  canEdit,
  saving,
  addLabel,
  onSaveAll,
  onAdd,
  onChange,
  onDelete,
  allowDelete = true,
  dirty,
}: {
  title: string;
  subtitle: string;
  rows: T[];
  fields: ProfileField[];
  canEdit: boolean;
  saving: string | null;
  addLabel: string;
  onSaveAll: () => Promise<void>;
  onAdd: () => void;
  onChange: (index: number, field: ProfileField, value: unknown, option?: SearchOption) => void;
  onDelete?: (row: T, index: number) => Promise<void>;
  allowDelete?: boolean;
  dirty: boolean;
}) {
  const saveLabel = `保存${title}`;
  return (
    <SectionShell
      title={title}
      subtitle={subtitle}
      actions={canEdit ? (
        <>
          <ActionButton
            onClick={onAdd}
            disabled={saving !== null}
            variant="secondary"
          >
            {addLabel}
          </ActionButton>
          <ActionButton
            onClick={onSaveAll}
            disabled={saving !== null || !dirty}
            variant="primary"
          >
            {saving === "employment" || saving === "project" ? "保存中..." : saveLabel}
          </ActionButton>
        </>
      ) : null}
    >
      <div className="space-y-4">
        {rows.length === 0 ? (
          <EmptyStateCard compact>暂无记录</EmptyStateCard>
        ) : (
          rows.map((row, index) => (
            <PanelCard key={row.id ?? `new-${index}`} bodyClassName="p-4">
              <ActionToolbar
                className="mb-4 border-0 bg-transparent p-0 shadow-none"
                leftSlot={(
                  <div className="text-sm font-semibold text-slate-800">
                    {row.isNew ? "新增记录" : `记录 #${row.id}`}
                  </div>
                )}
                rightSlot={canEdit && allowDelete && onDelete ? (
                  <ActionButton
                    disabled={saving !== null}
                    onClick={() => onDelete(row, index)}
                    variant="danger"
                    className="px-3 py-1.5 text-xs"
                  >
                    删除
                  </ActionButton>
                ) : null}
              />
              {fieldGrid(fields, row as unknown as EditableRecord, !canEdit, (key, value, option) => {
                const field = fields.find((item) => item.key === key);
                if (field) onChange(index, field, value, option);
              })}
            </PanelCard>
          ))
        )}
      </div>
    </SectionShell>
  );
}

function pickFields(fields: ProfileField[], keys: string[]) {
  return keys
    .map((key) => fields.find((field) => field.key === key))
    .filter(Boolean) as ProfileField[];
}

function EmploymentSection({
  employment,
  primaryContract,
  contracts,
  canEdit,
  saving,
  onSaveAll,
  onChange,
  onAddContract,
  onChangeContract,
  onDeleteContract,
  dirty,
}: {
  employment: EmploymentRow | null;
  primaryContract: ContractRow | null;
  contracts: ContractRow[];
  canEdit: boolean;
  saving: string | null;
  onSaveAll: () => Promise<void>;
  onChange: (field: ProfileField, value: unknown, option?: SearchOption) => void;
  onAddContract: () => void;
  onChangeContract: (index: number, field: ProfileField, value: unknown, option?: SearchOption) => void;
  onDeleteContract: (row: ContractRow, index: number) => Promise<void>;
  dirty: boolean;
}) {
  const fields = employmentFields.filter((field) => field.key !== "currentCompany");
  const facts = [
    { label: "当前公司", value: primaryContract?.company || employment?.currentCompany || "-" },
    { label: "合同类型", value: primaryContract?.contractType || "-" },
    { label: "用工形式", value: primaryContract?.employmentForm || "-" },
    { label: "参保状态", value: primaryContract?.insuranceStatus || "-" },
  ];

  return (
    <SectionShell
      title="雇佣关系"
      subtitle="在职状态、入离职、参保和合同信息。"
      actions={canEdit && employment ? (
        <ActionButton
          onClick={onSaveAll}
          disabled={saving !== null || !dirty}
          variant="primary"
        >
          {saving === "employment" ? "保存中..." : "保存雇佣关系"}
        </ActionButton>
      ) : null}
    >
      {!employment ? (
        <EmptyStateCard compact>暂无雇佣主档</EmptyStateCard>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {facts.map((fact) => (
              <MetricCard key={fact.label} label={fact.label} value={fact.value} />
            ))}
          </div>
          {fieldGrid(fields, employment as unknown as EditableRecord, !canEdit, (key, value, option) => {
            const field = fields.find((item) => item.key === key);
            if (field) onChange(field, value, option);
          })}
          <div className="border-t border-slate-200 pt-5">
            <ContractSection
              rows={contracts}
              canEdit={canEdit}
              saving={saving}
              onAdd={onAddContract}
              onChange={onChangeContract}
              onDelete={onDeleteContract}
            />
          </div>
        </div>
      )}
    </SectionShell>
  );
}

function contractPeriodEndDate(row: ContractRow) {
  if (row.endDate) return row.endDate;
  const periods = [
    { start: row.firstContractStartDate, end: row.firstContractEndDate },
    { start: row.secondContractStartDate, end: row.secondContractEndDate },
    { start: row.thirdContractStartDate, end: row.thirdContractEndDate },
  ];
  for (let i = periods.length - 1; i >= 0; i--) {
    const period = periods[i];
    if (!period.start && !period.end) continue;
    if (period.start && !period.end) return null;
    return period.end;
  }
  return null;
}

function normalizeContractRow<T extends ContractRow>(row: T): T {
  const periodEndDates = [row.firstContractEndDate, row.secondContractEndDate, row.thirdContractEndDate].filter(Boolean);
  if (!row.endDate || (!row.permanentContractDate && !periodEndDates.includes(row.endDate))) return row;
  return { ...row, endDate: null };
}

function RowActions({
  canEdit,
  saving,
  onDelete,
}: {
  canEdit: boolean;
  saving: string | null;
  onDelete: () => Promise<void>;
}) {
  if (!canEdit) return null;
  const disabled = saving !== null;
  return (
    <div>
      <ActionButton
        disabled={disabled}
        onClick={onDelete}
        variant="danger"
        className="px-3 py-1.5 text-xs"
      >
        删除
      </ActionButton>
    </div>
  );
}

function ContractSection({
  rows,
  canEdit,
  saving,
  onAdd,
  onChange,
  onDelete,
}: {
  rows: ContractRow[];
  canEdit: boolean;
  saving: string | null;
  onAdd: () => void;
  onChange: (index: number, field: ProfileField, value: unknown, option?: SearchOption) => void;
  onDelete: (row: ContractRow, index: number) => Promise<void>;
}) {
  const overviewFields = pickFields(contractFields, [
    "company",
    "isPrimary",
    "insuranceStatus",
    "legalRelation",
    "contractType",
    "employmentForm",
    "confidentialityDate",
    "nonCompeteDate",
  ]);
  const signingGroups = [
    { title: "首签", fields: pickFields(contractFields, ["firstContractStartDate", "firstContractEndDate"]) },
    { title: "续签一", fields: pickFields(contractFields, ["secondContractStartDate", "secondContractEndDate"]) },
    { title: "续签二", fields: pickFields(contractFields, ["thirdContractStartDate", "thirdContractEndDate"]) },
    { title: "无固定期限", fields: pickFields(contractFields, ["permanentContractDate", "endDate"]) },
  ];

  return (
    <div className="space-y-4">
      <ActionToolbar
        className="border-0 bg-transparent p-0 shadow-none"
        leftSlot={(
          <div>
            <h3 className="text-base font-semibold text-slate-950">合同</h3>
            <p className="mt-1 text-sm text-slate-500">合同概况和每次签订分开维护。</p>
          </div>
        )}
        secondaryActions={canEdit ? [{
          label: "新增合同",
          disabled: saving !== null,
          onClick: onAdd,
        }] : []}
      />
      <div className="space-y-4">
        {rows.length === 0 ? (
          <EmptyStateCard compact>暂无合同</EmptyStateCard>
        ) : (
          rows.map((row, index) => {
            const normalizedRow = normalizeContractRow(row);
            const current = isCurrentByEndDate(normalizedRow.permanentContractDate ? normalizedRow.endDate : contractPeriodEndDate(normalizedRow));
            return (
              <PanelCard key={row.id ?? `new-contract-${index}`} bodyClassName="p-4">
                <ActionToolbar
                  className="mb-4 border-0 bg-transparent p-0 shadow-none"
                  leftSlot={(
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {row.isNew ? "新增合同" : `合同 #${row.id}`}
                        </span>
                        <StatusBadge label={current ? "当前合同" : "历史合同"} variant={current ? "green" : "gray"} />
                        {row.isPrimary && <StatusBadge label="主合同" variant="blue" />}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.company || "未设置公司"} · {row.contractType || "未设置合同类型"} · {row.legalRelation || "未设置法律关系"}
                      </p>
                    </div>
                  )}
                  rightSlot={(
                    <RowActions
                      canEdit={canEdit}
                      saving={saving}
                      onDelete={() => onDelete(row, index)}
                    />
                  )}
                />
                <PanelCard title="合同概况" bodyClassName="p-4">
                  {fieldGrid(overviewFields, normalizedRow as unknown as EditableRecord, !canEdit, (key, value, option) => {
                    const field = contractFields.find((item) => item.key === key);
                    if (field) onChange(index, field, value, option);
                  })}
                </PanelCard>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {signingGroups.map((group) => (
                    <PanelCard key={group.title} title={group.title} bodyClassName="p-4">
                      {fieldGrid(group.fields, normalizedRow as unknown as EditableRecord, !canEdit, (key, value, option) => {
                        const field = contractFields.find((item) => item.key === key);
                        if (!field) return;
                        if (field.key === "permanentContractDate" && value) {
                          onChange(index, field, value, option);
                          const endDateField = contractFields.find((item) => item.key === "endDate");
                          if (endDateField) onChange(index, endDateField, null);
                          return;
                        }
                        onChange(index, field, value, option);
                      })}
                    </PanelCard>
                  ))}
                </div>
              </PanelCard>
            );
          })
        )}
      </div>
    </div>
  );
}

function EdpSection({
  rows,
  canEdit,
  saving,
  onSaveAll,
  onAdd,
  onChange,
  onDelete,
  dirty,
}: {
  rows: EdpRow[];
  canEdit: boolean;
  saving: string | null;
  onSaveAll: () => Promise<void>;
  onAdd: () => void;
  onChange: (index: number, field: ProfileField, value: unknown, option?: SearchOption) => void;
  onDelete: (row: EdpRow, index: number) => Promise<void>;
  dirty: boolean;
}) {
  const orgFields = pickFields(edpFields, ["departmentId", "positionId", "isPrimary", "workPercent", "reportTo"]);
  const dateFields = pickFields(edpFields, ["startDate", "endDate"]);
  const detailFields: ProfileField[] = [];
  const allFields = [...orgFields, ...dateFields, ...detailFields];
  const currentRows = rows.filter((row) => isCurrentByEndDate(row.endDate));
  const percentCheck = validateCurrentWorkPercent(rows);
  const currentTotal = currentRows.reduce((sum, row) => {
    const value = parseWorkPercent(row.workPercent);
    return sum + (Number.isFinite(value) ? Number(value) : 0);
  }, 0);

  return (
    <SectionShell
      title="部门岗位"
      subtitle="当前岗位与历史岗位分开标识。"
      status={(
        <StatusBadge
          label={`当前岗位 ${currentRows.length} 条，工作占比合计 ${currentTotal.toFixed(2)}`}
          variant={percentCheck.ok ? "green" : "red"}
        />
      )}
      actions={canEdit ? (
        <>
          <ActionButton
            onClick={onAdd}
            disabled={saving !== null}
            variant="secondary"
          >
            新增岗位记录
          </ActionButton>
          <ActionButton
            onClick={onSaveAll}
            disabled={saving !== null || !dirty}
            variant="primary"
          >
            {saving === "edp" ? "保存中..." : "保存部门岗位"}
          </ActionButton>
        </>
      ) : null}
    >
      <div className="space-y-4">
        {rows.length === 0 ? (
          <EmptyStateCard compact>暂无岗位记录</EmptyStateCard>
        ) : (
          rows.map((row, index) => {
            const current = isCurrentByEndDate(row.endDate);
            return (
              <PanelCard key={row.id ?? `new-edp-${index}`} bodyClassName="p-4">
                <ActionToolbar
                  className="mb-4 border-0 bg-transparent p-0 shadow-none"
                  leftSlot={(
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {row.isNew ? "新增岗位记录" : row.positionName || `岗位记录 #${row.id}`}
                        </span>
                        <StatusBadge label={current ? "当前岗位" : "历史岗位"} variant={current ? "green" : "gray"} />
                        {row.isPrimary && <StatusBadge label="主岗" variant="blue" />}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.departmentName || "未设置部门"} · 占比 {row.workPercent || "未设置"} · {row.startDate || "未设置开始"} 至 {row.endDate || "长期"}
                      </p>
                    </div>
                  )}
                  rightSlot={(
                    <RowActions
                      canEdit={canEdit}
                      saving={saving}
                      onDelete={() => onDelete(row, index)}
                    />
                  )}
                />
                <PanelCard title="岗位信息" bodyClassName="p-4">
                  {fieldGrid(allFields, row as unknown as EditableRecord, !canEdit, (key, value, option) => {
                    const field = edpFields.find((item) => item.key === key);
                    if (field) onChange(index, field, value, option);
                  })}
                </PanelCard>
              </PanelCard>
            );
          })
        )}
      </div>
    </SectionShell>
  );
}

function HistorySection({
  entries,
  loading,
  expandedId,
  onToggle,
  onRefresh,
}: {
  entries: ProfileHistoryEntry[];
  loading: boolean;
  expandedId: number | null;
  onToggle: (id: number) => void;
  onRefresh: () => void;
}) {
  const changeColumns: DataTableColumn<ProfileHistoryEntry["changes"][number]>[] = [
    {
      key: "field",
      label: "字段",
      required: true,
      render: (change) => <span className="font-medium text-slate-700">{change.label}</span>,
    },
    {
      key: "from",
      label: "原值",
      required: true,
      render: (change) => <span className="text-slate-500">{change.from}</span>,
    },
    {
      key: "to",
      label: "新值",
      required: true,
      render: (change) => <span className="text-slate-900">{change.to}</span>,
    },
  ];

  return (
    <SectionShell
      title="历史记录"
      subtitle="记录谁在什么时候修改了哪些字段。"
      actions={(
        <ActionButton
          onClick={onRefresh}
          variant="secondary"
        >
          刷新
        </ActionButton>
      )}
    >
      <div className="space-y-3">
        {loading ? (
          <EmptyStateCard compact>正在加载历史记录...</EmptyStateCard>
        ) : entries.length === 0 ? (
          <EmptyStateCard compact>暂无变更记录</EmptyStateCard>
        ) : (
          entries.map((entry) => {
            const expanded = expandedId === entry.id;
            return (
              <DisclosureRecordCard
                key={entry.id}
                expanded={expanded}
                onToggle={() => onToggle(entry.id)}
                header={(
                  <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {entry.editorName} 修改了 {entry.changes.length} 项
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {new Date(entry.createdAt).toLocaleString("zh-CN", { hour12: false })} · {entry.entityType} #{entry.entityId} · v{entry.version}
                      </div>
                    </div>
                )}
                summary={<span className="text-xs text-slate-400">{expanded ? "收起" : "展开"}</span>}
              >
                    <DataTable
                      rows={entry.changes}
                      columns={changeColumns}
                      visibleColumns={["field", "from", "to"]}
                      density="compact"
                      rowKey={(change) => `${entry.id}-${change.field}`}
                    />
              </DisclosureRecordCard>
            );
          })
        )}
      </div>
    </SectionShell>
  );
}
