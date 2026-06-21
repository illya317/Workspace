"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ActionToolbar, FormField, TextField } from "@workspace/core/ui";
import DetailModal from "@workspace/core/ui/DetailModal";

interface PasswordModalProps {
  open: boolean;
  onClose: () => void;
}

export default function PasswordModal({ open, onClose }: PasswordModalProps) {
  const router = useRouter();
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState("");

  useEffect(() => {
    if (open) {
      setOldPwd("");
      setNewPwd("");
      setConfirmPwd("");
      setPwdError("");
      setPwdSuccess("");
    }
  }, [open]);

  async function handleChangePassword() {
    setPwdError("");
    setPwdSuccess("");

    if (newPwd !== confirmPwd) {
      setPwdError("两次输入的新密码不一致");
      return;
    }

    const res = await fetch(workspacePath("/api/auth/change-password"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }),
    });

    const data = await res.json();
    if (!res.ok) {
      setPwdError(data.error || "修改失败");
      return;
    }

    setPwdSuccess("密码修改成功，请重新登录");
    setOldPwd("");
    setNewPwd("");
    setConfirmPwd("");
    setTimeout(() => {
      onClose();
      router.push("/login");
    }, 1500);
  }

  return (
    <DetailModal
      open={open}
      title="修改密码"
      onClose={onClose}
      maxWidth="max-w-sm"
    >
      <div className="space-y-4">
        <FormField label="旧密码" required>
          <TextField
            type="password"
            value={oldPwd}
            onChange={setOldPwd}
            required
            autoFocus
          />
        </FormField>
        <FormField label="新密码" required>
          <TextField
            type="password"
            value={newPwd}
            onChange={setNewPwd}
            required
            minLength={4}
          />
        </FormField>
        <FormField label="确认新密码" required>
          <TextField
            type="password"
            value={confirmPwd}
            onChange={setConfirmPwd}
            required
            minLength={4}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleChangePassword();
            }}
          />
        </FormField>
        {pwdError && <p className="text-sm text-red-500">{pwdError}</p>}
        {pwdSuccess && <p className="text-sm text-emerald-600">{pwdSuccess}</p>}
        <ActionToolbar
          className="justify-end border-0 p-0 pt-2 shadow-none"
          secondaryActions={[{ label: "取消", onClick: onClose }]}
          primaryActions={[{ label: "确认", onClick: () => void handleChangePassword() }]}
        />
      </div>
    </DetailModal>
  );
}
