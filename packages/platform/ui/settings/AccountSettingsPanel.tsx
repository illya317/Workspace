"use client";

import { workspacePath } from "@workspace/core/routing";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CommandButton, FileField, FormField, PageContent, PanelCard, TextField } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import ApiAccessClient, { type ApiAccessModuleRow } from "./ApiAccessClient";
type Message = {
  type: "success" | "error";
  text: string;
} | null;
interface AccountSettingsPanelProps {
  user: SessionUser;
  onUserRefresh: () => void;
  apiAccessModules: ApiAccessModuleRow[];
}
function FormMessage({
  message
}: {
  message: Message;
}) {
  if (!message) return null;
  return <p className={`text-sm ${message.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
      {message.text}
    </p>;
}
export default function AccountSettingsPanel({
  user,
  onUserRefresh,
  apiAccessModules
}: AccountSettingsPanelProps) {
  const router = useRouter();
  const [username, setUsername] = useState(user.username || "");
  const [nickname, setNickname] = useState(user.nickname || "");
  const [avatar, setAvatar] = useState(user.avatar || "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [usernameMessage, setUsernameMessage] = useState<Message>(null);
  const [avatarMessage, setAvatarMessage] = useState<Message>(null);
  const [passwordMessage, setPasswordMessage] = useState<Message>(null);
  useEffect(() => {
    setUsername(user.username || "");
    setNickname(user.nickname || "");
    setAvatar(user.avatar || "");
  }, [user.avatar, user.nickname, user.username]);
  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [avatarFile]);
  async function saveProfile() {
    setUsernameMessage(null);
    const res = await fetch(workspacePath("/api/settings/account/username"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: username.trim(),
        nickname: nickname.trim()
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setUsernameMessage({
        type: "error",
        text: data.error || "修改失败"
      });
      return;
    }
    setUsernameMessage({
      type: "success",
      text: "账号资料已更新"
    });
    onUserRefresh();
  }
  async function saveAvatarUrl(nextAvatar: string) {
    setAvatarMessage(null);
    const res = await fetch(workspacePath("/api/settings/account/avatar"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        avatar: nextAvatar.trim() || null
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setAvatarMessage({
        type: "error",
        text: data.error || "修改失败"
      });
      return;
    }
    setAvatar(nextAvatar);
    setAvatarFile(null);
    setAvatarMessage({
      type: "success",
      text: nextAvatar.trim() ? "头像已更新" : "头像已清除"
    });
    onUserRefresh();
  }
  function selectAvatar(file: File | null) {
    setAvatarMessage(null);
    setAvatarFile(file);
  }
  async function saveAvatar() {
    if (!avatarFile) {
      setAvatarMessage({
        type: "error",
        text: "请先选择头像文件"
      });
      return;
    }
    setAvatarSaving(true);
    setAvatarMessage(null);
    const formData = new FormData();
    formData.append("file", avatarFile);
    const res = await fetch(workspacePath("/api/settings/account/avatar-library"), {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      setAvatarMessage({
        type: "error",
        text: data.error || "上传失败"
      });
      setAvatarSaving(false);
      return;
    }
    await saveAvatarUrl(data.avatar.url);
    setAvatarSaving(false);
  }
  async function savePassword() {
    setPasswordMessage(null);
    if (newPwd !== confirmPwd) {
      setPasswordMessage({
        type: "error",
        text: "两次输入的新密码不一致"
      });
      return;
    }
    const res = await fetch(workspacePath("/api/settings/account/password"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        oldPassword: oldPwd,
        newPassword: newPwd
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setPasswordMessage({
        type: "error",
        text: data.error || "修改失败"
      });
      return;
    }
    setPasswordMessage({
      type: "success",
      text: "密码修改成功，请重新登录"
    });
    setOldPwd("");
    setNewPwd("");
    setConfirmPwd("");
    setTimeout(() => router.push("/login"), 1500);
  }
  return <PageContent className="max-w-4xl py-10">
      <div className="flex min-w-0 items-center gap-4 p-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-50 bg-cover bg-center text-xl font-semibold text-emerald-700" style={avatar ? {
        backgroundImage: `url(${avatar})`
      } : undefined} aria-hidden="true">
          {avatar ? null : user.nickname?.slice(0, 1) || "?"}
        </span>
        <span>
          <span className="block truncate text-lg font-semibold text-slate-900">{user.nickname || "当前用户"}</span>
          <span className="mt-1 block text-sm font-normal text-slate-500">用户名：{user.username || "(未设置)"}</span>
        </span>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <PanelCard title="修改账号" className="h-full" bodyClassName="space-y-3 p-4">
          <FormField label="姓名">
            <TextField value={user.employeeName || user.nickname || ""} readOnly visualVariant="muted" />
          </FormField>
          <FormField label="昵称">
            <TextField value={nickname} onChange={setNickname} onKeyDown={event => {
            if (event.key === "Enter") void saveProfile();
          }} />
          </FormField>
          <FormField label="用户名">
            <TextField value={username} onChange={setUsername} onKeyDown={event => {
            if (event.key === "Enter") void saveProfile();
          }} />
          </FormField>
          <FormMessage message={usernameMessage} />
        </PanelCard>

        <PanelCard title="修改密码" className="h-full" bodyClassName="space-y-3 p-4">
          <FormField label="旧密码">
            <TextField type="password" value={oldPwd} onChange={setOldPwd} />
          </FormField>
          <FormField label="新密码">
            <TextField type="password" value={newPwd} onChange={setNewPwd} minLength={4} />
          </FormField>
          <FormField label="确认新密码">
            <TextField type="password" value={confirmPwd} onChange={setConfirmPwd} minLength={4} onKeyDown={event => {
            if (event.key === "Enter") void savePassword();
          }} />
          </FormField>
          <FormMessage message={passwordMessage} />
          <CommandButton variant="secondary" onClick={() => void savePassword()}>
            保存密码
          </CommandButton>
        </PanelCard>

        <PanelCard title="修改头像" className="h-full" bodyClassName="p-4">
          <div className="flex flex-col items-center gap-4">
            <span className="flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-full border border-emerald-100 bg-emerald-50 bg-cover bg-center text-3xl font-semibold text-emerald-700 shadow-inner" style={avatarPreviewUrl || avatar ? {
            backgroundImage: `url(${avatarPreviewUrl || avatar})`
          } : undefined} aria-hidden="true">
              {avatarPreviewUrl || avatar ? null : user.nickname?.slice(0, 1) || "?"}
            </span>
            <div className="grid w-full grid-cols-2 gap-2">
              <FileField accept="image/png,image/jpeg,image/webp,image/gif" inputClassName="h-10 w-full" showFileName={false} onChange={selectAvatar} />
              <CommandButton variant="primary" disabled={!avatarFile || avatarSaving} onClick={() => void saveAvatar()}>
                {avatarSaving ? "保存中..." : "保存头像"}
              </CommandButton>
            </div>
            <FormMessage message={avatarMessage} />
          </div>
        </PanelCard>
      </div>
      <ApiAccessClient user={user} modules={apiAccessModules} />
    </PageContent>;
}
