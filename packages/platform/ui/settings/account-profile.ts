"use client";

import type { SessionUser } from "@workspace/platform/types";
import { putJson, requestJson } from "../api-client";

const ACCOUNT_PROFILE_ENDPOINT = "/api/settings/account/profile";

export interface AccountProfileForm {
  username: string;
  alias: string;
  phone: string;
  employeeId: string | null;
}

export function accountProfileFromUser(user: SessionUser): AccountProfileForm {
  return {
    username: user.username || "",
    alias: "",
    phone: "",
    employeeId: user.employeeId ?? null,
  };
}

export function normalizeAccountProfile(profile: AccountProfileForm): AccountProfileForm {
  return {
    username: profile.username.trim(),
    alias: profile.alias.trim(),
    phone: normalizeAccountPhoneInput(profile.phone),
    employeeId: profile.employeeId ?? null,
  };
}

export function sameAccountProfile(left: AccountProfileForm, right: AccountProfileForm) {
  return left.username === right.username
    && left.alias === right.alias
    && left.phone === right.phone
    && left.employeeId === right.employeeId;
}

export function readAccountAliasTags(value: unknown) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? normalizeAliasTags(parsed) : [];
  } catch {
    return normalizeAliasTags(String(value).split(/[,，、;；\n]+/));
  }
}

export function serializeAccountAliasTags(tags: unknown[]) {
  const normalized = normalizeAliasTags(tags);
  return normalized.length > 0 ? JSON.stringify(normalized) : "";
}

export function normalizeAccountPhoneInput(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 11);
}

export function formatAccountPhoneInput(value: unknown) {
  const normalized = normalizeAccountPhoneInput(value);
  if (normalized.length <= 3) return normalized;
  if (normalized.length <= 7) return `${normalized.slice(0, 3)} ${normalized.slice(3)}`;
  return `${normalized.slice(0, 3)} ${normalized.slice(3, 7)} ${normalized.slice(7)}`;
}

function normalizeAliasTags(tags: unknown[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of tags) {
    const tag = String(item).trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    normalized.push(tag);
  }
  return normalized;
}

interface AccountProfileResponse {
  username: string;
  alias: string | null;
  phone: string | null;
  employeeId: string | null;
}

function toAccountProfileForm(profile: AccountProfileResponse): AccountProfileForm {
  return {
    username: profile.username,
    alias: profile.alias ?? "",
    phone: normalizeAccountPhoneInput(profile.phone),
    employeeId: profile.employeeId ?? null,
  };
}

export async function fetchAccountProfile() {
  return toAccountProfileForm(await requestJson<AccountProfileResponse>(ACCOUNT_PROFILE_ENDPOINT, {
    fallbackMessage: "加载账号资料失败",
  }));
}

export async function saveAccountProfile(profile: AccountProfileForm) {
  const result = await putJson<{ success: true; profile: AccountProfileResponse }>(
    ACCOUNT_PROFILE_ENDPOINT,
    {
      username: profile.username,
      alias: profile.alias || null,
      phone: profile.phone || null,
    },
    "保存账号资料失败",
  );
  return toAccountProfileForm(result.profile);
}
