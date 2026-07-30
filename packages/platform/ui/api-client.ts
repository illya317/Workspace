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

/**
 * Transport Adapter for direct business commands. The business form does not
 * know about command metadata; the adapter supplies a stable key for backends
 * that record command receipts. It never replays a write implicitly because
 * not every business command is replay-safe.
 */
export function directCommandHeaders(headers?: HeadersInit) {
  const next = new Headers(headers);
  if (!next.has("Idempotency-Key")) next.set("Idempotency-Key", globalThis.crypto.randomUUID());
  return next;
}

export async function directCommandFetch(url: string, init?: RequestInit) {
  return fetch(workspacePath(url), {
    ...init,
    headers: directCommandHeaders(init?.headers),
  });
}

export async function requestDirectCommandJson<T = unknown>(url: string, init?: RequestJsonOptions): Promise<T> {
  const { fallbackMessage, headers, ...requestInit } = init ?? {};
  const commandHeaders = directCommandHeaders(headers);
  if (!commandHeaders.has("Content-Type")) commandHeaders.set("Content-Type", "application/json");
  const sendAndRead = async () => {
    const res = await directCommandFetch(url, { ...requestInit, headers: commandHeaders });
    const data = await readJsonResponse(res);
    return { res, data };
  };
  const response = await sendAndRead();
  const { res, data } = response;
  if (!res.ok) {
    const error = typeof data === "object" && data && "error" in data ? String(data.error) : null;
    throw new Error(error || fallbackMessage || `请求失败 (${res.status})`);
  }
  return data as T;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (error instanceof TypeError) throw error;
    return {};
  }
}

export function postDirectCommandJson<T = unknown>(url: string, body: unknown, fallbackMessage?: string) {
  return requestDirectCommandJson<T>(url, {
    method: "POST",
    body: JSON.stringify(body),
    fallbackMessage,
  });
}

export function putDirectCommandJson<T = unknown>(url: string, body: unknown, fallbackMessage?: string) {
  return requestDirectCommandJson<T>(url, {
    method: "PUT",
    body: JSON.stringify(body),
    fallbackMessage,
  });
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
