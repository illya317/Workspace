"use client";

import { useEffect, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { createFieldsSection, createPageBody, BodySurface, type BodySurfaceCommandSpec, type BodySurfaceSectionSpec, type SurfaceToolbarItem, useFeedback } from "@workspace/core/ui";
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
  const lines = [`Base URL: ${baseUrl}`, `X-API-Key: ${apiKey}`, `User: ${username}`, "", "API rules:", "- Request URL = Base URL + path below", "- Business: /api/modules/<l1>/<l2-kebab>/*", "- Settings: /api/settings/<l2>/*", "- Auth: /api/auth/*", "- 智能体: /api/agent/*", "- Source of truth: module registry / API registry. Run arch:gate after API changes.", "", "L1/L2 modules:"];
  for (const moduleRow of modules) {
    lines.push(`- ${moduleRow.label} (${moduleRow.key}): ${moduleRow.apiPrefix}`);
    for (const child of moduleRow.children) {
      const api = child.apiPrefixes.length > 0 ? child.apiPrefixes.join(", ") : child.noApiReason ? `no API: ${child.noApiReason}` : "no API";
      lines.push(`  - ${child.label} (${child.resourceKey}): ${api}`);
    }
  }
  return lines.join("\n");
}
function copyFallback(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}
async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    copyFallback(text);
  }
}
function maskApiKey(apiKey: string) {
  if (apiKey.length <= 3) return apiKey;
  return `${apiKey.slice(0, 3)}${"*".repeat(apiKey.length - 3)}`;
}
export type ApiAccessSectionState = {
  section: BodySurfaceSectionSpec;
  toolbarItems: SurfaceToolbarItem[];
};
export function useApiAccessSection({
  user,
  modules
}: {
  user: SessionUser;
  modules: ApiAccessModuleRow[];
}): ApiAccessSectionState | null {
  const canUsePersonalApi = (user.visibleResourceKeys || []).includes("settings.account.apiAccess");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(Boolean(user.hasApiKey));
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
      hasApiKey?: boolean;
    }) => setHasApiKey(Boolean(data.hasApiKey))).catch(() => setHasApiKey(false));
  }, [canUsePersonalApi]);
  async function copyConnectionBlock() {
    await writeClipboard(buildAgentAccessText({
      baseUrl: apiBaseUrl,
      apiKey: apiKey || "<your-api-key>",
      username: user.username || "<your-username>",
      modules
    }));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    feedback.success("已复制 API 接入信息");
  }
  async function rotateApiKey() {
    setLoading(true);
    try {
      const res = await fetch(workspacePath("/api/settings/account/api-key"), {
        method: "POST"
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "重置失败" }));
        feedback.error(error.error || "重置失败");
        return;
      }
      const data = (await res.json()) as {
        apiKey?: string | null;
        hasApiKey?: boolean;
      };
      const nextApiKey = data.apiKey || null;
      setApiKey(nextApiKey);
      setHasApiKey(Boolean(data.hasApiKey || data.apiKey));
      if (nextApiKey) {
        await writeClipboard(buildAgentAccessText({
          baseUrl: apiBaseUrl,
          apiKey: nextApiKey,
          username: user.username || "<your-username>",
          modules
        }));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        feedback.success("已复制 API 接入信息");
      } else {
        feedback.success("API Key 已更新");
      }
    } catch {
      feedback.error("网络错误");
    } finally {
      setLoading(false);
    }
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
    content: [
          `URL: ${apiBaseUrl}`,
          `Key: ${apiKey ? maskApiKey(apiKey) : hasApiKey ? "已生成（仅申请/重置时显示一次）" : "（先申请）"}`,
          `User: ${user.username || "（未获取）"}`,
        ].join("\n"),
  }], { kind: "detail", layout: { columns: 1 } });
  const actions: BodySurfaceCommandSpec[] = [
    hasApiKey ? {
      key: "rotate-api-key",
      label: loading ? "重置中..." : "重置 Key",
      icon: "reset",
      onClick: () => void confirmRotateApiKey(),
      disabled: loading,
    } : {
      key: "create-api-key",
      label: loading ? "申请中..." : "申请 Key",
      icon: "generate",
      onClick: () => void rotateApiKey(),
      disabled: loading,
    },
    {
      key: "copy-api-access",
      label: copied ? "已复制" : "复制接入信息",
      icon: "copy",
      variant: "primary",
      disabled: !apiKey,
      onClick: () => void copyConnectionBlock(),
    },
  ];
  const toolbarItems: SurfaceToolbarItem[] = [
    hasApiKey ? {
      kind: "icon-button",
      key: "rotate-api-key",
      icon: "reset",
      label: loading ? "重置中..." : "重置 Key",
      onClick: () => void confirmRotateApiKey(),
      disabled: loading,
    } : {
      kind: "icon-button",
      key: "create-api-key",
      icon: "generate",
      label: loading ? "申请中..." : "申请 Key",
      onClick: () => void rotateApiKey(),
      disabled: loading,
    },
    {
      kind: "icon-button",
      key: "copy-api-access",
      icon: "copy",
      label: copied ? "已复制" : "复制接入信息",
      variant: "primary",
      disabled: !apiKey,
      onClick: () => void copyConnectionBlock(),
    },
  ];
  return { section: { ...section, header: { title: "API 接入", actions } }, toolbarItems };
}

export default function ApiAccessClient(props: {
  user: SessionUser;
  modules: ApiAccessModuleRow[];
}) {
  const apiAccess = useApiAccessSection(props);
  if (!apiAccess) return null;
  return (
    <div className="py-6">
      <BodySurface {...createPageBody([apiAccess.section])} />
    </div>
  );
}
