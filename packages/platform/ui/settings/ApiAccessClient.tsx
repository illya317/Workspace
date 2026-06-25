"use client";

import { useEffect, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { CodeBlock, ConfirmModal, SectionCard, getToolbarActionClassName } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
const API_BASE_URL = typeof window !== "undefined" ? `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH || ""}` : "";
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
export default function ApiAccessClient({
  user,
  modules
}: {
  user: SessionUser;
  modules: ApiAccessModuleRow[];
}) {
  const canUsePersonalApi = (user.visibleResourceKeys || []).includes("settings.account.apiAccess");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => {
    if (!canUsePersonalApi) return;
    fetch(workspacePath("/api/settings/account/api-key")).then(res => res.ok ? res.json() : Promise.reject()).then((data: {
      apiKey?: string | null;
    }) => setApiKey(data.apiKey || null)).catch(() => setApiKey(null));
  }, [canUsePersonalApi]);
  async function copyConnectionBlock() {
    await navigator.clipboard.writeText(buildAgentAccessText({
      baseUrl: API_BASE_URL,
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
    setConfirmOpen(false);
  }
  return <div className="space-y-6 py-6">
      {canUsePersonalApi && <SectionCard title="API 接入" actions={<div className="flex flex-wrap gap-2">
            {apiKey ? <button type="button" onClick={() => setConfirmOpen(true)} disabled={loading} className={getToolbarActionClassName()}>
                {loading ? "申请中..." : "重新申请"}
              </button> : <button type="button" onClick={rotateApiKey} disabled={loading} className={getToolbarActionClassName()}>
                {loading ? "申请中..." : "申请 Key"}
              </button>}
            <button type="button" onClick={copyConnectionBlock} className={getToolbarActionClassName("primary")}>
              {copied ? "已复制" : "复制接入信息"}
            </button>
          </div>}>
        <CodeBlock className="space-y-1">
          <div>URL: {API_BASE_URL}</div>
          <div>Key: {apiKey ? maskApiKey(apiKey) : "（先申请）"}</div>
          <div>User: {user.username || user.nickname || "（未获取）"}</div>
        </CodeBlock>
        <ConfirmModal open={confirmOpen} title="确认覆盖" message="申请新的 API Key 将覆盖旧 Key，旧 Key 会立即失效。" onConfirm={rotateApiKey} onCancel={() => setConfirmOpen(false)} confirmDanger={false} />
      </SectionCard>}

    </div>;
}
