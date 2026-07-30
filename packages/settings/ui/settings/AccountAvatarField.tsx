"use client";

import { workspacePath } from "@workspace/core/routing";
import { ActionGlyph, type FormSurfaceItemSpec, useFeedback } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { useEffect, useState } from "react";
import { postJson } from "@workspace/platform/ui/api-client";

interface AccountAvatarFieldOptions {
  user: SessionUser;
  username: string;
  onUserRefresh: () => void;
}

export function useAccountAvatarField({
  user,
  username,
  onUserRefresh,
}: AccountAvatarFieldOptions): FormSurfaceItemSpec {
  const feedback = useFeedback();
  const [avatar, setAvatar] = useState(user.avatar || "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarSaving, setAvatarSaving] = useState(false);

  useEffect(() => {
    setAvatar(user.avatar || "");
  }, [user.avatar]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [avatarFile]);

  async function saveAvatarUrl(nextAvatar: string) {
    try {
      await postJson("/api/settings/account/avatar", { avatar: nextAvatar.trim() || null }, "修改失败");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "修改失败");
      return false;
    }
    setAvatar(nextAvatar);
    setAvatarFile(null);
    feedback.success("头像已更新");
    onUserRefresh();
    return true;
  }

  async function saveAvatar(file: File) {
    setAvatarSaving(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(workspacePath("/api/settings/account/avatar-library"), {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        feedback.error(data.error || "上传失败");
        setAvatarFile(null);
        return;
      }
      const saved = await saveAvatarUrl(data.avatar.url);
      if (!saved) setAvatarFile(null);
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "上传失败");
      setAvatarFile(null);
    } finally {
      setAvatarSaving(false);
    }
  }

  function selectAvatar(file: File | null) {
    setAvatarFile(file);
    if (file) void saveAvatar(file);
  }

  return {
    key: "avatar",
    label: "头像",
    rowSpan: 2,
    spec: { valueType: "file", control: "file", state: avatarSaving ? "disabled" : "normal" },
    value: null,
    accept: "image/png,image/jpeg,image/webp,image/gif",
    fileVariant: "inline",
    showFileName: false,
    resetOnChange: true,
    onChange: (file: unknown) => selectAvatar(file instanceof File ? file : null),
    buttonLabel: (
      <span
        className="group relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-emerald-50 bg-cover bg-center text-2xl font-semibold text-emerald-700 shadow-sm ring-1 ring-emerald-100 transition hover:ring-2 hover:ring-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-500"
        style={avatarPreviewUrl || avatar ? { backgroundImage: `url(${avatarPreviewUrl || avatar})` } : undefined}
      >
        {avatarPreviewUrl || avatar ? null : (username || "?").slice(0, 1)}
        <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-white text-slate-500 shadow-sm transition group-hover:bg-emerald-50 group-hover:text-emerald-700">
          <ActionGlyph kind="upload" className="h-3.5 w-3.5" />
        </span>
        {avatarSaving ? <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/80 text-[10px] text-emerald-700">保存中</span> : null}
      </span>
    ),
  };
}
