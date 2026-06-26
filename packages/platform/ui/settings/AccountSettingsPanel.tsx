"use client";

import { workspacePath } from "@workspace/core/routing";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageSurface, type PageSurfaceBlockSpec } from "@workspace/core/ui";
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
  const blocks: PageSurfaceBlockSpec[] = [
    {
      kind: "message",
      key: "profile-header",
      content: (
        <div className="flex min-w-0 items-center gap-4">
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
      ),
    },
    {
      kind: "surfaceGroup",
      key: "account-forms",
      layout: "grid",
      className: "lg:grid-cols-3",
      blocks: [
        {
          kind: "section",
          key: "profile",
          title: "修改账号",
          className: "h-full",
          blocks: [{
            kind: "form",
            key: "profile-form",
            surface: {
              kind: "fields",
              columns: 1,
              fields: [
                {
                  key: "employee-name",
                  label: "姓名",
                  spec: { valueType: "string", editor: "input", state: "readonly" },
                  value: user.employeeName || user.nickname || "",
                },
                {
                  key: "nickname",
                  label: "昵称",
                  spec: { valueType: "string", editor: "input" },
                  value: nickname,
                  onChange: (value) => setNickname(String(value ?? "")),
                  onKeyDown: (event) => {
                    if (event.key === "Enter") void saveProfile();
                  },
                },
                {
                  key: "username",
                  label: "用户名",
                  spec: { valueType: "string", editor: "input" },
                  value: username,
                  onChange: (value) => setUsername(String(value ?? "")),
                  onKeyDown: (event) => {
                    if (event.key === "Enter") void saveProfile();
                  },
                },
                ...(usernameMessage ? [{
                  kind: "note" as const,
                  key: "username-message",
                  content: <FormMessage message={usernameMessage} />,
                }] : []),
              ],
            },
          }],
        },
        {
          kind: "section",
          key: "password",
          title: "修改密码",
          className: "h-full",
          blocks: [{
            kind: "form",
            key: "password-form",
            surface: {
              kind: "fields",
              columns: 1,
              fields: [
                {
                  key: "old-password",
                  label: "旧密码",
                  spec: { valueType: "string", editor: "input" },
                  type: "password",
                  value: oldPwd,
                  onChange: (value) => setOldPwd(String(value ?? "")),
                },
                {
                  key: "new-password",
                  label: "新密码",
                  spec: { valueType: "string", editor: "input" },
                  type: "password",
                  value: newPwd,
                  onChange: (value) => setNewPwd(String(value ?? "")),
                  minLength: 4,
                },
                {
                  key: "confirm-password",
                  label: "确认新密码",
                  spec: { valueType: "string", editor: "input" },
                  type: "password",
                  value: confirmPwd,
                  onChange: (value) => setConfirmPwd(String(value ?? "")),
                  minLength: 4,
                  onKeyDown: (event) => {
                    if (event.key === "Enter") void savePassword();
                  },
                },
                ...(passwordMessage ? [{
                  kind: "note" as const,
                  key: "password-message",
                  content: <FormMessage message={passwordMessage} />,
                }] : []),
              ],
              actions: [{ key: "save-password", label: "保存密码", variant: "secondary", onClick: () => void savePassword() }],
            },
          }],
        },
        {
          kind: "section",
          key: "avatar",
          title: "修改头像",
          className: "h-full",
          blocks: [{
            kind: "form",
            key: "avatar-form",
            surface: {
              kind: "fields",
              columns: 1,
              fields: [
                {
                  kind: "note" as const,
                  key: "avatar-preview",
                  content: (
                    <div className="flex justify-center">
                      <span className="flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-full border border-emerald-100 bg-emerald-50 bg-cover bg-center text-3xl font-semibold text-emerald-700 shadow-inner" style={avatarPreviewUrl || avatar ? {
                      backgroundImage: `url(${avatarPreviewUrl || avatar})`
                    } : undefined} aria-hidden="true">
                        {avatarPreviewUrl || avatar ? null : user.nickname?.slice(0, 1) || "?"}
                      </span>
                    </div>
                  ),
                },
                {
                  key: "avatar-file",
                  label: "头像文件",
                  spec: { valueType: "file", editor: "upload" },
                  value: null,
                  className: "h-10 w-full",
                  accept: "image/png,image/jpeg,image/webp,image/gif",
                  showFileName: false,
                  onChange: (file) => selectAvatar(file instanceof File ? file : null),
                },
                ...(avatarMessage ? [{
                  kind: "note" as const,
                  key: "avatar-message",
                  content: <FormMessage message={avatarMessage} />,
                }] : []),
              ],
              actions: [{ key: "save-avatar", label: avatarSaving ? "保存中..." : "保存头像", variant: "primary", disabled: !avatarFile || avatarSaving, onClick: () => void saveAvatar() }],
            },
          }],
        },
      ],
    },
    {
      kind: "surfaceGroup",
      key: "api-access",
      blocks: [{ kind: "message", key: "api-access-client", content: <ApiAccessClient user={user} modules={apiAccessModules} /> }],
    },
  ];
  return <PageSurface kind="settings" contentClassName="max-w-4xl py-10" blocks={blocks} />;
}
