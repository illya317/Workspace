import type { WWLoginInstance } from "@wecom/jssdk";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";

type WecomPanelStartResponse = { authorizeUrl?: string; error?: string };

function getSafeNextPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith(`${BASE_PATH}/`) && !next.startsWith("//")) return next;
  return `${BASE_PATH}/portal`;
}

function requireLoginUrlParam(url: URL, key: string) {
  const value = url.searchParams.get(key)?.trim();
  if (!value) throw new Error(`企业微信登录参数缺少 ${key}`);
  return value;
}

export async function mountWecomLoginPanel(input: {
  element: HTMLDivElement;
  signal: AbortSignal;
  onError: (message: string) => void;
}): Promise<WWLoginInstance | null> {
  const startUrl = new URL(`${BASE_PATH}/api/auth/wecom/start`, window.location.origin);
  startUrl.searchParams.set("display", "panel");
  const next = getSafeNextPath();
  if (next !== `${BASE_PATH}/portal`) startUrl.searchParams.set("next", next);

  const response = await fetch(startUrl, {
    credentials: "include",
    cache: "no-store",
    signal: input.signal,
  });
  const data = await response.json().catch(() => ({})) as WecomPanelStartResponse;
  if (!response.ok || !data.authorizeUrl) {
    throw new Error(data.error || "企业微信登录初始化失败");
  }

  const loginUrl = new URL(data.authorizeUrl);
  const {
    createWWLoginPanel,
    WWLoginLangType,
    WWLoginPanelSizeType,
    WWLoginRedirectType,
    WWLoginType,
  } = await import("@wecom/jssdk");
  if (input.signal.aborted) return null;

  return createWWLoginPanel({
    el: input.element,
    params: {
      login_type: WWLoginType.corpApp,
      appid: requireLoginUrlParam(loginUrl, "appid"),
      agentid: requireLoginUrlParam(loginUrl, "agentid"),
      redirect_uri: requireLoginUrlParam(loginUrl, "redirect_uri"),
      state: requireLoginUrlParam(loginUrl, "state"),
      redirect_type: WWLoginRedirectType.top,
      panel_size: WWLoginPanelSizeType.small,
      lang: WWLoginLangType.zh,
    },
    onLoginFail: (result) => {
      if (!input.signal.aborted) input.onError(result.errMsg || "企业微信登录失败，请重试");
    },
  });
}
