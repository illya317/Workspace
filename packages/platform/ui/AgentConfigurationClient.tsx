"use client";

import { useCallback, useState } from "react";
import { createPageBody, createPageTabBar, PageSurface, useFeedback } from "@workspace/core/ui";
import type {
  AgentConfigurationData,
  AgentConfigurationUpdateResult,
} from "@workspace/platform/types";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import { putJson, requestJson } from "./api-client";
import { useAgentPermissionManagementSections } from "./agent-permission-management";
import {
  permissionSections,
  profileSections,
  runtimeSections,
  type AgentConfigurationEditor,
  type AgentProfileConfigurationDraft,
  type AgentRuntimeConfigurationDraft,
} from "./agent-configuration-sections";

type Props = {
  data: AgentConfigurationData;
  canConfigure: boolean;
};

function profileDraftsFrom(data: AgentConfigurationData): Record<number, AgentProfileConfigurationDraft> {
  return Object.fromEntries(data.profiles.map((profile) => [profile.id, {
    displayName: profile.displayName,
    roleName: profile.roleName,
    responsibilities: profile.responsibilities,
    status: profile.status,
  }]));
}

function runtimeDraftsFrom(data: AgentConfigurationData): Record<number, AgentRuntimeConfigurationDraft> {
  return Object.fromEntries(data.profiles.flatMap((profile) => profile.runtimes.map((runtime) => [runtime.id, {
    status: runtime.status,
    interactive: runtime.interactive,
    instructions: runtime.instructions,
    capabilityKeys: runtime.capabilityKeys,
  }])));
}

export function AgentConfigurationClient({ data, canConfigure }: Props) {
  const tabs = getPageViewTabs("/agent/config");
  const feedback = useFeedback();
  const [active, setActive] = useState(tabs[0]?.key ?? "profiles");
  const [currentData, setCurrentData] = useState(data);
  const [profileDrafts, setProfileDrafts] = useState(() => profileDraftsFrom(data));
  const [runtimeDrafts, setRuntimeDrafts] = useState(() => runtimeDraftsFrom(data));
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const refreshConfiguration = useCallback(async () => {
    const refreshed = await requestJson<AgentConfigurationData>("/api/modules/agent/config", {
      fallbackMessage: "刷新 Agent 配置失败",
    });
    setCurrentData(refreshed);
  }, []);

  function updateProfile(profileId: number, patch: Partial<AgentProfileConfigurationDraft>) {
    setProfileDrafts((current) => ({
      ...current,
      [profileId]: { ...current[profileId], ...patch },
    }));
  }

  function updateRuntime(runtimeId: number, patch: Partial<AgentRuntimeConfigurationDraft>) {
    setRuntimeDrafts((current) => ({
      ...current,
      [runtimeId]: { ...current[runtimeId], ...patch },
    }));
  }

  async function saveProfile(profileId: number) {
    const draft = profileDrafts[profileId];
    if (!canConfigure || !draft || savingKey) return;
    setSavingKey(`profile:${profileId}`);
    try {
      const result = await putJson<AgentConfigurationUpdateResult>(
        "/api/modules/agent/config",
        { profileId, profile: draft },
        "保存 Agent 档案失败",
      );
      if (!result.profile) throw new Error("服务端未返回 Agent 档案");
      const savedProfile = result.profile;
      setCurrentData((current) => ({
        ...current,
        generatedAt: new Date().toISOString(),
        profiles: current.profiles.map((profile) => profile.id === profileId
          ? { ...profile, ...savedProfile }
          : profile),
      }));
      setProfileDrafts((current) => ({
        ...current,
        [profileId]: {
          displayName: savedProfile.displayName,
          roleName: savedProfile.roleName,
          responsibilities: savedProfile.responsibilities,
          status: savedProfile.status,
        },
      }));
      feedback.success("Agent 档案已保存");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "保存 Agent 档案失败");
    } finally {
      setSavingKey(null);
    }
  }

  async function saveRuntime(profileId: number, runtimeId: number) {
    const draft = runtimeDrafts[runtimeId];
    if (!canConfigure || !draft || savingKey) return;
    setSavingKey(`runtime:${runtimeId}`);
    try {
      const result = await putJson<AgentConfigurationUpdateResult>(
        "/api/modules/agent/config",
        { profileId, runtime: { id: runtimeId, ...draft } },
        "保存 Agent 运行配置失败",
      );
      if (!result.runtime) throw new Error("服务端未返回 Agent 运行配置");
      const savedRuntime = result.runtime;
      setCurrentData((current) => ({
        ...current,
        generatedAt: new Date().toISOString(),
        profiles: current.profiles.map((profile) => profile.id === profileId
          ? {
              ...profile,
              runtimes: profile.runtimes.map((runtime) => runtime.id === runtimeId
                ? { ...runtime, ...savedRuntime, configurationValid: true }
                : runtime),
            }
          : profile),
      }));
      setRuntimeDrafts((current) => ({
        ...current,
        [runtimeId]: {
          status: savedRuntime.status,
          interactive: savedRuntime.interactive,
          instructions: savedRuntime.instructions,
          capabilityKeys: savedRuntime.capabilityKeys,
        },
      }));
      feedback.success("Agent 运行配置已保存");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "保存 Agent 运行配置失败");
    } finally {
      setSavingKey(null);
    }
  }

  const editor: AgentConfigurationEditor = {
    canConfigure,
    savingKey,
    profileDrafts,
    runtimeDrafts,
    updateProfile,
    updateRuntime,
    saveProfile: (profileId) => { void saveProfile(profileId); },
    saveRuntime: (profileId, runtimeId) => { void saveRuntime(profileId, runtimeId); },
  };
  const permissionManagementSections = useAgentPermissionManagementSections({
    data: currentData,
    canConfigure,
    enabled: active === "permissions",
    onConfigurationChanged: refreshConfiguration,
    onCeilingSaved: (actionKeys) => setCurrentData((current) => ({
      ...current,
      generatedAt: new Date().toISOString(),
      globalActionCeiling: actionKeys,
    })),
    onSuccess: feedback.success,
    onError: feedback.error,
  });
  const sections = active === "runtimes"
    ? runtimeSections(currentData, editor)
    : active === "permissions"
      ? permissionSections(currentData, editor, permissionManagementSections)
      : profileSections(currentData, editor);

  return (
    <PageSurface
      kind="standard"
      tabbar={createPageTabBar({ items: tabs, active, onChange: setActive, ariaLabel: "Agent 配置视图" })}
      body={createPageBody(sections)}
    />
  );
}
