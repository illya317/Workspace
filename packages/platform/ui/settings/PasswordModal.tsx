"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TextField, getToolbarActionClassName } from "@workspace/core/ui";
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

    const res = await fetch("/workspace/api/auth/change-password", {
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
        <div>
          <label className="mb-1.5 block text-sm text-gray-500">旧密码</label>
          <TextField
            type="password"
            value={oldPwd}
            onChange={setOldPwd}
            required
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-gray-500">新密码</label>
          <TextField
            type="password"
            value={newPwd}
            onChange={setNewPwd}
            required
            minLength={4}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-gray-500">确认新密码</label>
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
        </div>
        {pwdError && <p className="text-sm text-red-500">{pwdError}</p>}
        {pwdSuccess && <p className="text-sm text-emerald-600">{pwdSuccess}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className={getToolbarActionClassName("secondary")}
          >
            取消
          </button>
          <button
            type="submit"
            onClick={() => void handleChangePassword()}
            className={getToolbarActionClassName("primary")}
          >
            确认
          </button>
        </div>
      </div>
    </DetailModal>
  );
}
