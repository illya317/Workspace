import { useEffect, useState } from "react";

import { useFeedback } from "@workspace/core/ui";
import { directCommandFetch, requestJson } from "@workspace/platform/ui/api-client";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";
import type { InvestorRelationshipView } from "../types";
import {
  emptyInvestorDueDiligenceDraft,
  shareholderProfileDraft,
  type InvestorDueDiligenceDraft,
  type InvestorShareholderProfileDraft,
} from "./investor-relationship-forms";

const ENDPOINT = "/api/modules/capitalSecurities/investors";
const SHAREHOLDER_PROFILE_ENDPOINT = `${ENDPOINT}/shareholder-profiles`;
const DUE_DILIGENCE_ENDPOINT = `${ENDPOINT}/due-diligence`;

type InvestorView = "shareholders" | "captable" | "structure" | "diligence";

type InvestorRelationshipCapabilities = {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

export function useInvestorRelationshipState({
  canCreate,
  canUpdate,
  canDelete,
}: InvestorRelationshipCapabilities) {
  const businessTimeZone = useTenantConfig().localization.businessTimeZone;
  const [view, setView] = useState<InvestorView>("shareholders");
  const [asOf, setAsOf] = useState(() => currentBusinessDate(businessTimeZone));
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedPartyId, setSelectedPartyId] = useState<number | null>(null);
  const [selectedDiligenceId, setSelectedDiligenceId] = useState<number | null>(null);
  const [data, setData] = useState<InvestorRelationshipView | null>(null);
  const [profileDraft, setProfileDraft] = useState<InvestorShareholderProfileDraft | null>(null);
  const [diligenceDraft, setDiligenceDraft] = useState<InvestorDueDiligenceDraft | null>(null);
  const [creatingDiligence, setCreatingDiligence] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState("");
  const [mobileDetailActive, setMobileDetailActive] = useState(false);
  const [exportingStructure, setExportingStructure] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingDiligence, setSavingDiligence] = useState(false);
  const feedback = useFeedback();

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ asOf });
    if (selectedCompanyId) params.set("issuerCompanyId", String(selectedCompanyId));
    setLoading(true);
    setError("");
    void requestJson<InvestorRelationshipView>(`${ENDPOINT}?${params.toString()}`)
      .then((nextData) => {
        if (!active) return;
        setData(nextData);
        if (selectedCompanyId === null && nextData.selectedCompany) {
          setSelectedCompanyId(nextData.selectedCompany.id);
        }
        setSelectedPartyId((current) => nextData.shareholders.some((item) => item.partyId === current)
          ? current
          : nextData.shareholders[0]?.partyId ?? null);
        setSelectedDiligenceId((current) => nextData.dueDiligenceRecords.some((item) => item.id === current)
          ? current
          : nextData.dueDiligenceRecords[0]?.id ?? null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "投资人关系加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [asOf, reloadKey, selectedCompanyId]);

  const selectedShareholder = data?.shareholders.find((item) => item.partyId === selectedPartyId) ?? null;
  const selectedDiligence = data?.dueDiligenceRecords.find((item) => item.id === selectedDiligenceId) ?? null;

  useEffect(() => {
    if (!selectedShareholder || !data?.selectedCompany) {
      setProfileDraft(null);
      return;
    }
    setProfileDraft(shareholderProfileDraft(selectedShareholder, data.selectedCompany.id));
  }, [data?.selectedCompany, selectedShareholder]);

  useEffect(() => {
    if (creatingDiligence) return;
    setDiligenceDraft(selectedDiligence ? { ...selectedDiligence } : null);
  }, [creatingDiligence, selectedDiligence]);

  function updateProfileDraft<K extends keyof InvestorShareholderProfileDraft>(
    key: K,
    value: InvestorShareholderProfileDraft[K],
  ) {
    setProfileDraft((current) => current ? { ...current, [key]: value } : current);
  }

  function resetProfileDraft() {
    if (selectedShareholder && data?.selectedCompany) {
      setProfileDraft(shareholderProfileDraft(selectedShareholder, data.selectedCompany.id));
    }
  }

  async function saveProfile() {
    if (!canUpdate || !profileDraft) return;
    setSavingProfile(true);
    try {
      const response = await directCommandFetch(SHAREHOLDER_PROFILE_ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileDraft),
      });
      if (!response.ok) throw new Error(await responseError(response, "保存股东资料失败"));
      feedback.success("股东资料已保存");
      setReloadKey((value) => value + 1);
    } catch (cause: unknown) {
      feedback.error(cause instanceof Error ? cause.message : "保存股东资料失败");
    } finally {
      setSavingProfile(false);
    }
  }

  function updateDiligenceDraft<K extends keyof InvestorDueDiligenceDraft>(
    key: K,
    value: InvestorDueDiligenceDraft[K],
  ) {
    setDiligenceDraft((current) => current ? { ...current, [key]: value } : current);
  }

  function openDiligenceCreate() {
    if (!canCreate || !data?.selectedCompany) return;
    setSelectedDiligenceId(null);
    setDiligenceDraft(emptyInvestorDueDiligenceDraft(
      data.selectedCompany.id,
      currentBusinessDate(businessTimeZone),
    ));
    setCreatingDiligence(true);
    setMobileDetailActive(true);
  }

  function cancelDiligenceCreate() {
    setCreatingDiligence(false);
    const record = data?.dueDiligenceRecords[0] ?? null;
    setSelectedDiligenceId(record?.id ?? null);
    setDiligenceDraft(record ? { ...record } : null);
    setMobileDetailActive(false);
  }

  async function createDiligence() {
    if (!canCreate || !diligenceDraft || !data?.selectedCompany) throw new Error("尽调资料未填写");
    setSavingDiligence(true);
    try {
      const response = await directCommandFetch(DUE_DILIGENCE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...diligenceDraft, issuerCompanyId: data.selectedCompany.id }),
      });
      if (!response.ok) throw new Error(await responseError(response, "新增尽调记录失败"));
      const payload = await response.json().catch(() => null) as { record?: { id: number } } | null;
      setCreatingDiligence(false);
      setSelectedDiligenceId(payload?.record?.id ?? null);
      setReloadKey((value) => value + 1);
      return { outcome: "saved" as const };
    } finally {
      setSavingDiligence(false);
    }
  }

  function resetDiligenceDraft() {
    if (selectedDiligence) setDiligenceDraft({ ...selectedDiligence });
  }

  async function saveDiligence() {
    const draft = diligenceDraft;
    if (!canUpdate || !draft?.id || draft.version === undefined) return;
    setSavingDiligence(true);
    try {
      const response = await directCommandFetch(`${DUE_DILIGENCE_ENDPOINT}/${draft.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "If-Match": String(draft.version),
        },
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error(await responseError(response, "保存尽调记录失败"));
      feedback.success("尽调记录已保存");
      setReloadKey((value) => value + 1);
    } catch (cause: unknown) {
      feedback.error(cause instanceof Error ? cause.message : "保存尽调记录失败");
    } finally {
      setSavingDiligence(false);
    }
  }

  async function archiveDiligence() {
    if (!canDelete || !diligenceDraft?.id || diligenceDraft.version === undefined) return;
    const confirmed = await feedback.confirm({
      title: "移除尽调记录",
      message: `确定移除“${diligenceDraft.visitorName}”的尽调记录吗？记录会归档保留，不再显示在当前列表中。`,
      confirmLabel: "移除",
    });
    if (!confirmed) return;
    setSavingDiligence(true);
    try {
      const response = await directCommandFetch(`${DUE_DILIGENCE_ENDPOINT}/${diligenceDraft.id}`, {
        method: "DELETE",
        headers: { "If-Match": String(diligenceDraft.version) },
      });
      if (!response.ok) throw new Error(await responseError(response, "移除尽调记录失败"));
      feedback.success("尽调记录已移除");
      setSelectedDiligenceId(null);
      setDiligenceDraft(null);
      setReloadKey((value) => value + 1);
    } catch (cause: unknown) {
      feedback.error(cause instanceof Error ? cause.message : "移除尽调记录失败");
    } finally {
      setSavingDiligence(false);
    }
  }

  return {
    businessTimeZone, view, setView, asOf, setAsOf,
    selectedCompanyId, setSelectedCompanyId, selectedPartyId, setSelectedPartyId,
    selectedDiligenceId, setSelectedDiligenceId, data, profileDraft, diligenceDraft,
    setDiligenceDraft, creatingDiligence, setCreatingDiligence, loading, error,
    mobileDetailActive, setMobileDetailActive, exportingStructure, setExportingStructure,
    savingProfile, savingDiligence, feedback, selectedShareholder, selectedDiligence,
    updateProfileDraft, resetProfileDraft, saveProfile, updateDiligenceDraft,
    openDiligenceCreate, cancelDiligenceCreate, createDiligence,
    resetDiligenceDraft, saveDiligence, archiveDiligence,
  };
}

export function currentBusinessDate(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function responseError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null;
  return payload?.error || payload?.message || `${fallback} (${response.status})`;
}
