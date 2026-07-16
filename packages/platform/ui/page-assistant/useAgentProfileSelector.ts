"use client";

import { workspacePath } from "@workspace/core/routing";
import type { NavigationSurfaceSelectorSpec } from "@workspace/core/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

type AgentProfileOption = {
  id: number;
  displayName: string;
  roleName: string;
};

type AgentProfilesResponse = {
  profiles?: AgentProfileOption[];
};

const SELF_AGENT_PROFILE_VALUE = "self";

export function useAgentProfileSelector(input: {
  open: boolean;
  onBeforeChange: () => void;
}) {
  const { open, onBeforeChange } = input;
  const [agentProfiles, setAgentProfiles] = useState<AgentProfileOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedAgentProfileId, setSelectedAgentProfileId] = useState<number | null>(null);

  const switchAgentProfile = useCallback((value: string) => {
    const candidate = value === SELF_AGENT_PROFILE_VALUE ? null : Number(value);
    const nextProfileId = candidate !== null && Number.isInteger(candidate) && candidate > 0
      ? candidate
      : null;
    if (nextProfileId === selectedAgentProfileId) return;
    onBeforeChange();
    setSelectedAgentProfileId(nextProfileId);
  }, [onBeforeChange, selectedAgentProfileId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoaded(false);
    fetch(workspacePath("/api/agent/profiles"))
      .then(async (response) => {
        if (!response.ok) throw new Error("加载 Workspace Agent 失败");
        return response.json() as Promise<AgentProfilesResponse>;
      })
      .then((body) => {
        if (cancelled) return;
        setAgentProfiles(Array.isArray(body.profiles) ? body.profiles : []);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setAgentProfiles([]);
        setSelectedAgentProfileId((current) => {
          if (current !== null) onBeforeChange();
          return null;
        });
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [onBeforeChange, open]);

  useEffect(() => {
    if (!open || !loaded || selectedAgentProfileId === null) return;
    if (agentProfiles.some((profile) => profile.id === selectedAgentProfileId)) return;
    switchAgentProfile(SELF_AGENT_PROFILE_VALUE);
  }, [agentProfiles, loaded, open, selectedAgentProfileId, switchAgentProfile]);

  const selector = useMemo<NavigationSurfaceSelectorSpec>(() => ({
    value: selectedAgentProfileId === null ? SELF_AGENT_PROFILE_VALUE : String(selectedAgentProfileId),
    label: "切换助手身份",
    options: [
      { value: SELF_AGENT_PROFILE_VALUE, label: "本人助手" },
      ...agentProfiles.map((profile) => ({
        value: String(profile.id),
        label: `${profile.displayName} · ${profile.roleName}`,
      })),
    ],
    onChange: switchAgentProfile,
  }), [agentProfiles, selectedAgentProfileId, switchAgentProfile]);

  return { selectedAgentProfileId, selector };
}
