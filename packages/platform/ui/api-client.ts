"use client";

import { workspacePath } from "@workspace/core/routing";

export interface RequestJsonOptions extends RequestInit {
  fallbackMessage?: string;
}

export async function requestJson<T = unknown>(url: string, init?: RequestJsonOptions): Promise<T> {
  const { fallbackMessage, headers, ...requestInit } = init ?? {};
  const res = await fetch(workspacePath(url), {
    ...requestInit,
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = typeof data === "object" && data && "error" in data ? String(data.error) : null;
    throw new Error(error || fallbackMessage || `请求失败 (${res.status})`);
  }
  return data as T;
}

export function postJson<T = unknown>(url: string, body: unknown, fallbackMessage?: string) {
  return requestJson<T>(url, {
    method: "POST",
    body: JSON.stringify(body),
    fallbackMessage,
  });
}

export function putJson<T = unknown>(url: string, body: unknown, fallbackMessage?: string) {
  return requestJson<T>(url, {
    method: "PUT",
    body: JSON.stringify(body),
    fallbackMessage,
  });
}
