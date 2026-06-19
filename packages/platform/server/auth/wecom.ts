import "server-only";

type WecomTokenResponse = {
  errcode?: number;
  errmsg?: string;
  access_token?: string;
  expires_in?: number;
};

type WecomUserInfoResponse = {
  errcode?: number;
  errmsg?: string;
  userid?: string;
  UserId?: string;
  user_ticket?: string;
};

export type WecomUserDetail = {
  errcode?: number;
  errmsg?: string;
  userid?: string;
  UserId?: string;
  name?: string;
  avatar?: string;
  gender?: string | number;
  mobile?: string;
  email?: string;
  qr_code?: string;
};

let tokenCache: { token: string; expiresAt: number } | null = null;

function requireWecomEnv() {
  const corpId = process.env.WECHAT_CORP_ID;
  const agentId = process.env.WECHAT_AGENT_ID;
  const secret = process.env.WECHAT_SECRET;
  if (!corpId || !agentId || !secret) {
    throw new Error("WECHAT_CORP_ID, WECHAT_AGENT_ID and WECHAT_SECRET are required");
  }
  return { corpId, agentId, secret };
}

async function readWecomJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`WeCom request failed with HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function assertWecomOk(data: { errcode?: number; errmsg?: string }, action: string) {
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`${action} failed: ${data.errcode} ${data.errmsg ?? ""}`.trim());
  }
}

export function buildWecomWebLoginUrl(redirectUri: string, state: string) {
  const { corpId, agentId } = requireWecomEnv();
  const url = new URL("https://login.work.weixin.qq.com/wwlogin/sso/login");
  url.searchParams.set("login_type", "CorpApp");
  url.searchParams.set("appid", corpId);
  url.searchParams.set("agentid", agentId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("lang", "zh");
  return url.toString();
}

export async function getWecomAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const { corpId, secret } = requireWecomEnv();
  const url = new URL("https://qyapi.weixin.qq.com/cgi-bin/gettoken");
  url.searchParams.set("corpid", corpId);
  url.searchParams.set("corpsecret", secret);

  const data = await readWecomJson<WecomTokenResponse>(url.toString());
  assertWecomOk(data, "Get WeCom access_token");
  if (!data.access_token) {
    throw new Error("Get WeCom access_token failed: missing access_token");
  }

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max((data.expires_in ?? 7200) - 300, 60) * 1000,
  };
  return tokenCache.token;
}

export async function getWecomUserByCode(code: string) {
  const token = await getWecomAccessToken();
  const url = new URL("https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo");
  url.searchParams.set("access_token", token);
  url.searchParams.set("code", code);

  const data = await readWecomJson<WecomUserInfoResponse>(url.toString());
  assertWecomOk(data, "Get WeCom user info");
  const userId = data.userid ?? data.UserId;
  if (!userId) {
    throw new Error("Get WeCom user info failed: missing userid");
  }
  return { userId, userTicket: data.user_ticket ?? null };
}

export async function getWecomUserDetail(userTicket: string): Promise<WecomUserDetail | null> {
  const token = await getWecomAccessToken();
  const url = new URL("https://qyapi.weixin.qq.com/cgi-bin/auth/getuserdetail");
  url.searchParams.set("access_token", token);

  const data = await readWecomJson<WecomUserDetail>(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_ticket: userTicket }),
  });
  assertWecomOk(data, "Get WeCom user detail");
  return data;
}
