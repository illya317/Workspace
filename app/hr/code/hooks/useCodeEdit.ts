"use client";

import { useState } from "react";
import { workspacePath } from "@/app/lib/api-path";
import { buildFullCode } from "../useCodeHelpers";
import type { CodeItem } from "../types";
import { type HRUser as User, hrCanEdit } from "@/app/hr/types";

export function useCodeEdit({
  user,
  apiPath,
  companyCode,
  departmentCode,
  codes,
  setCodes,
  showToast,
}: {
  user: User;
  type: "department" | "position";
  apiPath: string;
  companyCode: string;
  departmentCode?: string;
  codes: CodeItem[];
  setCodes: (v: CodeItem[] | ((prev: CodeItem[]) => CodeItem[])) => void;
  showToast: (message: string, type?: "success" | "error") => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [editRow, setEditRow] = useState<string | null>(null);
  const [editCodeValue, setEditCodeValue] = useState("");
  const [editNameValue, setEditNameValue] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const resolvedApiPath = workspacePath(apiPath);

  function startEditRow(item: CodeItem) {
    if (!hrCanEdit(user)) return;
    setEditRow(item.code);
    setEditCodeValue(item.code.length === 5 ? item.code.slice(2) : item.code);
    setEditNameValue(item.name);
  }

  async function saveEditRow(originalCode: string) {
    if (!/^\d{3}$/.test(editCodeValue)) {
      showToast("编号必须为3位数字", "error");
      return;
    }
    const newFullCode = buildFullCode(editCodeValue, companyCode);

    if (
      newFullCode !== originalCode &&
      codes.some((c) => c.code === newFullCode)
    ) {
      showToast("编号已存在", "error");
      return;
    }

    const putRes = await fetch(resolvedApiPath, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: editCodeValue,
        name: editNameValue.trim(),
        companyCode,
        originalCode: newFullCode !== originalCode ? originalCode : undefined,
      }),
    });
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({ error: "保存失败" }));
      showToast(err.error || "保存失败", "error");
      setEditRow(null);
      return;
    }
    setCodes((prev) =>
      prev
        .filter((c) => c.code !== originalCode)
        .concat({ code: newFullCode, name: editNameValue.trim() })
        .sort((a, b) => a.code.localeCompare(b.code))
    );
    showToast("保存成功");
    setEditRow(null);
  }

  async function handleAdd() {
    if (!/^\d{3}$/.test(newCode)) {
      showToast("编号必须为3位数字", "error");
      return;
    }
    if (!newName.trim()) {
      showToast("名称不能为空", "error");
      return;
    }
    const fullCode = buildFullCode(newCode, companyCode);
    if (codes.some((c) => c.code === fullCode)) {
      showToast("编号已存在", "error");
      return;
    }
    const body: Record<string, string> = {
      code: newCode,
      name: newName.trim(),
      companyCode,
    };
    if (departmentCode) {
      body.departmentCode = departmentCode;
    }
    const res = await fetch(resolvedApiPath, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setCodes((prev) =>
        [...prev, { code: fullCode, name: newName.trim() }].sort((a, b) =>
          a.code.localeCompare(b.code)
        )
      );
      setNewCode("");
      setNewName("");
      showToast("添加成功");
    } else {
      showToast("添加失败", "error");
    }
  }

  async function handleSave() {
    if (!editRow) return;
    setSaving(true);
    try {
      await saveEditRow(editRow);
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  }

  return {
    editMode,
    setEditMode,
    editRow,
    setEditRow,
    editCodeValue,
    setEditCodeValue,
    editNameValue,
    setEditNameValue,
    newCode,
    setNewCode,
    newName,
    setNewName,
    saving,
    startEditRow,
    saveEditRow,
    handleAdd,
    handleSave,
  };
}
