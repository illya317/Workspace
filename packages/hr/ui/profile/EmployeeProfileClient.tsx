"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { workspacePath } from "@workspace/core/routing";
import { useConfirmDelete } from "@workspace/core/ui";
import { hrCanEdit, type HRUser } from "@workspace/hr/types";
import {
  contractFields,
  edpFields,
  employeeFields,
  employeeProjectFields,
  employmentFields,
} from "@workspace/hr/constants";
import type { ProfileHistoryEntry } from "./EmployeeProfileSections";
import EmployeeProfileView from "./EmployeeProfileView";
import {
  applyDateFields,
  sameDraft,
  type EditableRecord,
} from "./EmployeeProfileUtils";
import {
  persistBasic,
  persistContracts,
  persistEdps,
  persistEmployeeProjects,
  persistEmployment,
} from "./EmployeeProfilePersistence";
import type {
  ContractRow,
  EdpRow,
  EmployeeProfile,
  EmployeeProfileEmployee,
  EmployeeProjectRow,
  EmploymentRow,
} from "@workspace/hr/types";
import type { FkFieldOption } from "@workspace/core/ui";

type ProfileSection = "basic" | "employment" | "edp" | "project" | "history";

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

  async function saveAll() {
    if (!profile || !employeeDraft) return;
    await runSave("all", async () => {
      await persistBasic(profile, employeeDraft);
      for (const row of employments) await persistEmployment(profile, row);
      await persistContracts(profile, contracts);
      await persistEdps(profile, edps);
      await persistEmployeeProjects(profile, employeeProjects);
    }, "员工资料已全部保存");
  }

  function updateEmployeeField(key: string, value: unknown, option?: FkFieldOption) {
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

  return (
    <EmployeeProfileView
      loading={loading}
      profile={profile}
      employeeDraft={employeeDraft}
      error={error}
      message={message}
      canEdit={canEdit}
      saving={saving}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      dirtyState={dirtyState}
      employments={employments}
      contracts={contracts}
      edps={edps}
      employeeProjects={employeeProjects}
      historyEntries={historyEntries}
      historyLoading={historyLoading}
      expandedHistoryId={expandedHistoryId}
      setEmployments={setEmployments}
      setContracts={setContracts}
      setEdps={setEdps}
      setEmployeeProjects={setEmployeeProjects}
      setError={setError}
      onBack={() => router.push("/hr/roster")}
      onSaveAll={saveAll}
      onEmployeeFieldChange={updateEmployeeField}
      onHistoryToggle={(id) => setExpandedHistoryId((current) => (current === id ? null : id))}
      onHistoryRefresh={loadHistory}
      confirmDelete={confirmDelete}
    />
  );
}
