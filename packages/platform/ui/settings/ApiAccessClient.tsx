"use client";

import { useEffect, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { createFieldsSection, createPageBody, PageSurface, type BodySurfaceSectionSpec, useFeedback } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
export type ApiAccessModuleRow = {
  key: string;
  label: string;
  apiPrefix: string;
  children: Array<{
    key: string;
    label: string;
    resourceKey: string;
    apiPrefixes: string[];
    noApiReason?: string;
  }>;
};
function buildAgentAccessText({
  baseUrl,
  apiKey,
  username,
  modules
}: {
  baseUrl: string;
  apiKey: string;
  username: string;
  modules: ApiAccessModuleRow[];
}) {
  const lines = [`Base URL: ${baseUrl}`, `X-API-Key: ${apiKey}`, `User: ${username}`, "", "API rules:", "- Request URL = Base URL + path below", "- Business: /api/modules/<l1>/<l2-kebab>/*", "- Settings: /api/settings/<l2>/*", "- Auth: /api/auth/*", "- Agent: /api/agent/*", "- Source of truth: module registry / API registry. Run arch:gate after API changes.", "", "L1/L2 modules:"];
  for (const moduleRow of modules) {
    lines.push(`- ${moduleRow.label} (${moduleRow.key}): ${moduleRow.apiPrefix}`);
    for (const child of moduleRow.children) {
      const api = child.apiPrefixes.length > 0 ? child.apiPrefixes.join(", ") : child.noApiReason ? `no API: ${child.noApiReason}` : "no API";
      lines.push(`  - ${child.label} (${child.resourceKey}): ${api}`);
    }
  }
  return lines.join("\n");
}
function maskApiKey(apiKey: string) {
  if (apiKey.length <= 3) return apiKey;
  return `${apiKey.slice(0, 3)}${"*".repeat(apiKey.length - 3)}`;
}
export function useApiAccessSection({
  user,
  modules
}: {
  user: SessionUser;
  modules: ApiAccessModuleRow[];
}): BodySurfaceSectionSpec | null {
  const canUsePersonalApi = (user.visibleResourceKeys || []).includes("settings.account.apiAccess");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const feedback = useFeedback();
  useEffect(() => {
    setApiBaseUrl(`${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH || ""}`);
  }, []);
  useEffect(() => {
    if (!canUsePersonalApi) return;
    fetch(workspacePath("/api/settings/account/api-key")).then(res => res.ok ? res.json() : Promise.reject()).then((data: {
      apiKey?: string | null;
    }) => setApiKey(data.apiKey || null)).catch(() => setApiKey(null));
  }, [canUsePersonalApi]);
  async function copyConnectionBlock() {
    await navigator.clipboard.writeText(buildAgentAccessText({
      baseUrl: apiBaseUrl,
      apiKey: apiKey || "<your-api-key>",
      username: user.username || user.nickname || "<your-username>",
      modules
    }));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  async function rotateApiKey() {
    setLoading(true);
    const res = await fetch(workspacePath("/api/settings/account/api-key"), {
      method: "POST"
    });
    if (res.ok) {
      const data = (await res.json()) as {
        apiKey?: string | null;
      };
      setApiKey(data.apiKey || null);
    }
    setLoading(false);
  }
  async function confirmRotateApiKey() {
    const ok = await feedback.confirm({
      title: "确认覆盖",
      message: "申请新的 API Key 将覆盖旧 Key，旧 Key 会立即失效。",
      confirmDanger: false,
    });
    if (ok) await rotateApiKey();
  }
  if (!canUsePersonalApi) return null;
  const section = createFieldsSection("api-access", [{
    kind: "note",
    key: "connection",
    content: (
      <pre className="space-y-1 whitespace-pre-wrap rounded-md bg-emerald-50 p-4 font-mono text-sm text-emerald-800">
        {[
          `URL: ${apiBaseUrl}`,
          `Key: ${apiKey ? maskApiKey(apiKey) : "（先申请）"}`,
          `User: ${user.username || user.nickname || "（未获取）"}`,
        ].join("\n")}
      </pre>
    ),
  }], { kind: "detail", layout: { columns: 1 } });
  return {
    ...section,
    header: {
      title: "API 接入",
      actions: [
        apiKey ? {
          key: "rotate",
          label: loading ? "申请中..." : "重新申请",
          onClick: () => void confirmRotateApiKey(),
          disabled: loading,
        } : {
          key: "create",
          label: loading ? "申请中..." : "申请 Key",
          onClick: () => void rotateApiKey(),
          disabled: loading,
        },
        {
          key: "copy",
          label: copied ? "已复制" : "复制接入信息",
          variant: "primary",
          onClick: () => void copyConnectionBlock(),
        },
      ],
    },
  };
}

export default function ApiAccessClient(props: {
  user: SessionUser;
  modules: ApiAccessModuleRow[];
}) {
  const section = useApiAccessSection(props);
  if (!section) return null;
  return <div className="py-6"><PageSurface kind="standard" embedded body={createPageBody([section])} /></div>;
}
