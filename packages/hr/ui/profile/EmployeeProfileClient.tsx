"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { workspacePath } from "@workspace/core/routing";
import { useFeedback } from "@workspace/core/ui";
import { hrCanEdit, type HRUser } from "@workspace/hr/types";
import {
  contractFields,
  edpFields,
  employeeFields,
  employmentFields,
} from "@workspace/hr/constants";
import type { ProfileHistoryEntry } from "./EmployeeProfileSections";
import EmployeeProfileView from "./EmployeeProfileView";
import {
  applyDateFields,
  persistableContractRows,
  persistableEdpRows,
  sameDraft,
  validateCurrentWorkPercent,
  type EditableRecord,
} from "./EmployeeProfileUtils";
import {
  persistBasic,
  persistContracts,
  persistEdps,
  persistEmployment,
} from "./EmployeeProfilePersistence";
import type {
  ContractRow,
  EdpRow,
  EmployeeProfile,
  EmployeeProfileEmployee,
  EmploymentRow,
} from "@workspace/hr/types";
import type { ReferenceOption } from "@workspace/core/ui";

type ProfileSection = "basic" | "employment" | "edp" | "history";

function newEmploymentRow(profile: EmployeeProfile): EmploymentRow {
  return {
    employeeId: profile.employee.id,
    isActive: true,
    currentCompany: null,
    joinDate: null,
    leaveDate: null,
    leaveReason: null,
    leaveNote: null,
    officeLocation: null,
    personnelType: null,
    rank: null,
    title: null,
    isNew: true,
  };
}

function newEdpRow(profile: EmployeeProfile): EdpRow {
  return {
    employeeId: profile.employee.id,
    departmentId: null,
    departmentName: null,
    positionId: null,
    positionName: null,
    isPrimary: false,
    startDate: null,
    endDate: null,
    reportTo: null,
    workPercent: null,
    isNew: true,
  };
}

function newContractRow(profile: EmployeeProfile, employments: EmploymentRow[]): ContractRow {
  return {
    employmentId: employments.find((row) => row.isActive)?.id ?? employments[0]?.id,
    employeeId: profile.employee.employeeId,
    employeeName: profile.employee.name,
    company: "",
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
  };
}

export default function EmployeeProfileClient({
  employeeId,
  onDirtyChange,
  user,
}: {
  employeeId: string;
  onDirtyChange?: (dirty: boolean) => void;
  user: HRUser;
}) {
  const router = useRouter();
  const canEdit = hrCanEdit(user);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [employeeDraft, setEmployeeDraft] = useState<EmployeeProfileEmployee | null>(null);
  const [employments, setEmployments] = useState<EmploymentRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [edps, setEdps] = useState<EdpRow[]>([]);
  const [historyEntries, setHistoryEntries] = useState<ProfileHistoryEntry[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<ProfileSection>("basic");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const message = null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(workspacePath(`/api/modules/hr/roster/employee-profiles/${employeeId}`));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `加载失败 (${res.status})`);
      const nextProfile = data as EmployeeProfile;
      setProfile(nextProfile);
      setEmployeeDraft(applyDateFields(nextProfile.employee as unknown as EditableRecord, employeeFields) as unknown as EmployeeProfileEmployee);
      const nextEmployments = nextProfile.employments.map((item) => applyDateFields(item as unknown as EditableRecord, employmentFields) as unknown as EmploymentRow);
      const nextEmploymentRows = nextEmployments.length > 0 ? nextEmployments : [newEmploymentRow(nextProfile)];
      setEmployments(nextEmploymentRows);
      const nextContracts = nextProfile.contracts.map((item) => applyDateFields(item as unknown as EditableRecord, contractFields) as unknown as ContractRow);
      setContracts(nextContracts.length > 0 ? nextContracts : [newContractRow(nextProfile, nextEmploymentRows)]);
      const nextEdps = nextProfile.edps.map((item) => applyDateFields(item as unknown as EditableRecord, edpFields) as unknown as EdpRow);
      setEdps(nextEdps.length > 0 ? nextEdps : [newEdpRow(nextProfile)]);
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
      const res = await fetch(workspacePath(`/api/modules/hr/roster/employee-profiles/${employeeId}/history`));
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
    const employment = Boolean(profile && (!sameDraft(employments, profile.employments) || !sameDraft(persistableContractRows(contracts), profile.contracts)));
    const edp = Boolean(profile && !sameDraft(persistableEdpRows(edps), profile.edps));
    return {
      basic,
      employment,
      edp,
      all: basic || employment || edp,
    };
  }, [contracts, edps, employeeDraft, employments, profile]);
  const feedback = useFeedback({ unsavedChanges: dirtyState.all });

  useEffect(() => {
    onDirtyChange?.(dirtyState.all);
  }, [dirtyState.all, onDirtyChange]);

  async function showSavePrompt(title: string, text: string, danger: boolean) {
    await feedback.confirm({
      title,
      message: text,
      confirmLabel: "关闭",
      confirmDanger: danger,
      showCancel: false,
    });
  }

  async function runSave(savingKey: string, task: () => Promise<void>, successMessage: string) {
    setSaving(savingKey);
    setError(null);
    try {
      await task();
      await load();
      await showSavePrompt("保存成功", successMessage, false);
    } catch (err) {
      await showSavePrompt("保存失败", err instanceof Error ? err.message : "保存失败", true);
    } finally {
      setSaving(null);
    }
  }

  async function saveAll() {
    if (!profile || !employeeDraft) return;
    if (dirtyState.edp) {
      const percentCheck = validateCurrentWorkPercent(persistableEdpRows(edps));
      if (!percentCheck.ok) {
        setActiveSection("edp");
        setError(null);
        await showSavePrompt("部门岗位无法保存", percentCheck.message, true);
        return;
      }
    }
    await runSave("all", async () => {
      if (dirtyState.basic) await persistBasic(profile, employeeDraft);
      if (dirtyState.employment) {
        const employmentsDirty = !sameDraft(employments, profile.employments);
        const contractsDirty = !sameDraft(persistableContractRows(contracts), profile.contracts);
        if (employmentsDirty) {
          for (const row of employments) await persistEmployment(profile, row);
        }
        if (contractsDirty) await persistContracts(profile, contracts);
      }
      if (dirtyState.edp) await persistEdps(profile, edps);
    }, "员工资料已全部保存");
  }

  async function goBack() {
    const canLeave = await feedback.confirmLeave();
    if (canLeave) router.push("/hr/roster");
  }

  function changeSection(section: ProfileSection) {
    if (section === activeSection) return;
    setActiveSection(section);
  }

  function updateEmployeeField(key: string, value: unknown, option?: ReferenceOption) {
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
      onSectionChange={changeSection}
      dirtyState={dirtyState}
      employments={employments}
      contracts={contracts}
      edps={edps}
      historyEntries={historyEntries}
      historyLoading={historyLoading}
      expandedHistoryId={expandedHistoryId}
      setEmployments={setEmployments}
      setContracts={setContracts}
      setEdps={setEdps}
      setError={setError}
      onBack={() => void goBack()}
      onSaveAll={saveAll}
      onAddContract={() => {
        if (!profile) return;
        setContracts((rows) => [newContractRow(profile, employments), ...rows]);
      }}
      onEmployeeFieldChange={updateEmployeeField}
      onHistoryToggle={(id) => setExpandedHistoryId((current) => (current === id ? null : id))}
      onHistoryRefresh={loadHistory}
      confirmDelete={feedback.confirmDelete}
    />
  );
}
