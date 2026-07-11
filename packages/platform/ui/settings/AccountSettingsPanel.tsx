"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ActionGlyph, createFieldsSection, createSectionsSection, createPageBody, createPageTabBar, PageSurface, type BodySurfaceSectionSpec, type FormSurfaceItemSpec, type SurfaceToolbarItem, useFeedback } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { MAX_PINNED_PORTAL_SLOTS, normalizePortalSlots, type PortalSlot } from "../../portal-preferences";
import {
  accessiblePortalEntries,
  defaultSlotsForUser,
  fetchPortalSlotSettings,
  savePortalSlots,
} from "../portal-preferences";
import { accountProfileFromUser, fetchAccountProfile, formatAccountPhoneInput, normalizeAccountPhoneInput, normalizeAccountProfile, readAccountAliasTags, sameAccountProfile, saveAccountProfile, serializeAccountAliasTags, type AccountProfileForm } from "./account-profile";
import { useAccountAvatarField } from "./AccountAvatarField";
import { useAccountSpacePreferences } from "./AccountSpacePreferences";
import { useApiAccessSection, type ApiAccessModuleRow } from "./ApiAccessClient";
import AccountNotificationsPanel, { type AccountWorkflowDetailRenderer } from "./AccountNotificationsPanel";
type AccountPageTab = "profile" | "inbox";
const ACCOUNT_PAGE_TABS: AccountPageTab[] = ["profile", "inbox"];
interface AccountSettingsPanelProps {
  user: SessionUser;
  onUserRefresh: () => void;
  apiAccessModules: ApiAccessModuleRow[];
  workflowDetailRenderer?: AccountWorkflowDetailRenderer;
}
function isAccountPageTab(value: string): value is AccountPageTab {
  return ACCOUNT_PAGE_TABS.includes(value as AccountPageTab);
}
function parseAccountPageTab(value: string | null): AccountPageTab {
  return value === "inbox" ? "inbox" : "profile";
}
export default function AccountSettingsPanel({
  user,
  onUserRefresh,
  apiAccessModules,
  workflowDetailRenderer,
}: AccountSettingsPanelProps) {
  const feedback = useFeedback();
  const feedbackRef = useRef(feedback);
  const [username, setUsername] = useState(user.username || "");
  const [alias, setAlias] = useState("");
  const [phone, setPhone] = useState("");
  const [profileBaseline, setProfileBaseline] = useState<AccountProfileForm>(() => accountProfileFromUser(user));
  const [profileSaving, setProfileSaving] = useState(false);
  const [portalSlots, setPortalSlots] = useState<PortalSlot[]>(() => defaultSlotsForUser(user));
  const [portalSlotsSaving, setPortalSlotsSaving] = useState(false);
  const [editingPortalSlotIndex, setEditingPortalSlotIndex] = useState<number | null>(null);
  const [accountPageTab, setAccountPageTab] = useState<AccountPageTab>("profile");
  useEffect(() => {
    feedbackRef.current = feedback;
  }, [feedback]);
  const spacePreferences = useAccountSpacePreferences(feedbackRef);
  useEffect(() => {
    function syncFromLocation() {
      setAccountPageTab(parseAccountPageTab(new URL(window.location.href).searchParams.get("tab")));
    }
    function handleTabEvent(event: Event) {
      const detail = event instanceof CustomEvent ? String(event.detail ?? "") : "";
      if (isAccountPageTab(detail)) setAccountPageTab(detail);
    }
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    window.addEventListener("account-settings-tab", handleTabEvent);
    return () => {
      window.removeEventListener("popstate", syncFromLocation);
      window.removeEventListener("account-settings-tab", handleTabEvent);
    };
  }, [user.id]);
  useEffect(() => {
    let cancelled = false;
    fetchAccountProfile()
      .then((profile) => {
        if (cancelled) return;
        setUsername(profile.username);
        setAlias(profile.alias);
        setPhone(profile.phone);
        setProfileBaseline(profile);
      })
      .catch((error) => {
        if (cancelled) return;
        feedbackRef.current.error(error instanceof Error ? error.message : "加载账号资料失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetchPortalSlotSettings()
      .then((settings) => {
        if (!cancelled) setPortalSlots(settings.slots);
      })
      .catch((error) => {
        if (!cancelled) {
          feedback.error(error instanceof Error ? error.message : "加载桌面卡槽失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [feedback]);
  async function saveProfile(patch: Partial<AccountProfileForm> = {}) {
    const nextProfile = normalizeAccountProfile({
      username,
      alias,
      phone,
      employeeId: profileBaseline.employeeId,
      ...patch,
    });
    if (sameAccountProfile(nextProfile, profileBaseline)) {
      setUsername(profileBaseline.username);
      setAlias(profileBaseline.alias);
      setPhone(profileBaseline.phone);
      return;
    }
    if (profileSaving) return;
    setProfileSaving(true);
    try {
      const saved = await saveAccountProfile(nextProfile);
      setUsername(saved.username);
      setAlias(saved.alias);
      setPhone(saved.phone);
      setProfileBaseline(saved);
      feedback.success("账号资料已更新");
      onUserRefresh();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "保存账号资料失败");
    } finally {
      setProfileSaving(false);
    }
  }
  function cancelProfileEdit() {
    setUsername(profileBaseline.username);
    setAlias(profileBaseline.alias);
    setPhone(profileBaseline.phone);
  }
  function handleProfileKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") void saveProfile();
    if (event.key === "Escape") cancelProfileEdit();
  }
  function handleProfileBlur() {
    void saveProfile();
  }
  function updateAliasTags(tags: string[]) {
    const nextAlias = serializeAccountAliasTags(tags);
    setAlias(nextAlias);
    void saveProfile({ alias: nextAlias });
  }
  function normalizeNextPortalSlots(nextSlots: PortalSlot[]) {
    return normalizePortalSlots(nextSlots, new Set(accessiblePortalEntries(user).map((entry) => entry.key)));
  }
  async function persistPortalSlots(nextSlots: PortalSlot[]) {
    const normalized = normalizeNextPortalSlots(nextSlots);
    setPortalSlots(normalized);
    setPortalSlotsSaving(true);
    try {
      const data = await savePortalSlots(normalized);
      setPortalSlots(data.slots);
      feedback.success("桌面卡槽已更新");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "保存桌面卡槽失败");
    } finally {
      setPortalSlotsSaving(false);
    }
  }
  function setPortalSlotKey(index: number, value: unknown) {
    const key = String(value || "").trim() || null;
    const next = portalSlots.map((slot, slotIndex) => (
      slotIndex === index ? { ...slot, key, pinned: key ? slot.pinned : false } : slot
    ));
    void persistPortalSlots(next);
  }
  function clearPortalSlot(index: number) {
    const next = portalSlots.map((slot, slotIndex) => (
      slotIndex === index ? { ...slot, key: null, pinned: false } : slot
    ));
    void persistPortalSlots(next);
  }
  function togglePortalSlotPinned(index: number) {
    const slot = portalSlots[index];
    if (!slot?.key) {
      feedback.error("先选择卡槽入口");
      return;
    }
    if (!slot.pinned && portalSlots.filter((item) => item.pinned).length >= MAX_PINNED_PORTAL_SLOTS) {
      feedback.error("最多设置 2 个顶部快捷入口");
      return;
    }
    const next = portalSlots.map((item, slotIndex) => (
      slotIndex === index ? { ...item, pinned: !item.pinned } : item
    ));
    void persistPortalSlots(next);
  }
  function switchAccountPageTab(tab: AccountPageTab) {
    setAccountPageTab(tab);
    window.history.pushState(null, "", workspacePath(`/settings/account?tab=${tab}`));
  }
  const apiAccess = useApiAccessSection({ user, modules: apiAccessModules });
  const departmentChoiceItems = [
    { value: "", label: "未选择" },
    ...spacePreferences.preferredDepartments.map((department) => ({
      value: String(department.id),
      label: `${department.name} (${department.code})`,
    })),
  ];
  const projectChoiceItems = [
    { value: "", label: "未选择" },
    ...spacePreferences.preferredProjects.map((project) => ({
      value: String(project.id),
      label: [project.code, project.name].filter(Boolean).join(" · "),
      subtitle: project.projectLevel || undefined,
    })),
  ];
  const portalEntries = accessiblePortalEntries(user);
  function portalSlotChoiceItems(index: number) {
    const selectedElsewhere = new Set(portalSlots
      .map((slot, slotIndex) => slotIndex === index ? null : slot.key)
      .filter((key): key is string => Boolean(key)));
    return [
      { value: "", label: "未选择" },
      ...portalEntries
        .filter((entry) => !selectedElsewhere.has(entry.key))
        .map((entry) => ({
          value: entry.key,
          label: entry.level === 1 ? entry.label : `${entry.parentLabel} / ${entry.label}`,
          subtitle: entry.desc,
        })),
    ];
  }
  const portalEntryByKey = new Map(portalEntries.map((entry) => [entry.key, entry]));
  const portalSlotGridItems = portalSlots.map((slot, index) => {
    const entry = slot.key ? portalEntryByKey.get(slot.key) : null;
    return {
      key: `portal-slot-${index}`,
      title: entry?.label ?? "选择入口",
      description: entry?.desc ?? (entry?.level === 2 ? entry.parentLabel : "点击选择 L1 / L2"),
      icon: entry?.icon ?? <ActionGlyph kind="add" />,
      color: entry?.color ?? "emerald",
      badge: slot.pinned ? "快捷" : undefined,
      onClick: () => setEditingPortalSlotIndex(index),
    };
  });
  const editingPortalSlot = editingPortalSlotIndex === null ? null : portalSlots[editingPortalSlotIndex] ?? null;
  const editingPortalEntry = editingPortalSlot?.key ? portalEntryByKey.get(editingPortalSlot.key) : null;
  const avatarField = useAccountAvatarField({ user, username, onUserRefresh });
  const aliasTags = readAccountAliasTags(alias);
  const profileItems: FormSurfaceItemSpec<string>[] = [
    { kind: "readonly", key: "employee-id", label: "工号", value: profileBaseline.employeeId ?? user.employeeId ?? "" },
    {
      key: "username",
      label: "用户名",
      spec: { valueType: "string", control: "text", state: profileSaving ? "disabled" : "normal" },
      value: username,
      onChange: (value: unknown) => setUsername(String(value ?? "")),
      onKeyDown: handleProfileKeyDown,
      onBlur: handleProfileBlur,
    },
    avatarField,
    {
      kind: "tagList",
      key: "alias",
      label: "别名",
      items: aliasTags,
      getKey: (tag, index) => `${tag}-${index}`,
      getLabel: (tag) => tag,
      onRemove: (_, index) => updateAliasTags(aliasTags.filter((__, tagIndex) => tagIndex !== index)),
      onUpdateLabel: (_, index, next) => updateAliasTags(aliasTags.map((tag, tagIndex) => tagIndex === index ? next : tag)),
      disabled: profileSaving,
      shellClassName: "content-start",
      append: {
        textInput: {
          key: "accountAliasAppend",
          placeholder: aliasTags.length === 0 ? "添加别名" : "",
          onAppend: (values) => updateAliasTags([...aliasTags, ...values]),
          onRemoveLast: () => {
            if (aliasTags.length > 0) updateAliasTags(aliasTags.slice(0, -1));
          },
        },
      },
    },
    {
      key: "phone",
      label: "电话",
      spec: { valueType: "string", control: "text", state: profileSaving ? "disabled" : "normal" },
      value: formatAccountPhoneInput(phone),
      inputMode: "tel",
      maxLength: 13,
      onChange: (value: unknown) => setPhone(normalizeAccountPhoneInput(value)),
      onKeyDown: handleProfileKeyDown,
      onBlur: handleProfileBlur,
    },
    {
      key: "preferred-department-1",
      label: "常用部门",
      spec: { valueType: "string", control: "choice", options: { source: "static", items: departmentChoiceItems, visibleCount: 6 } },
      value: spacePreferences.preferredDepartmentIds[0] ? String(spacePreferences.preferredDepartmentIds[0]) : "",
      placeholder: "选择部门",
      onChange: (value: unknown) => spacePreferences.setPreferredDepartmentAt(0, value),
    },
    {
      key: "preferred-department-2",
      label: "部门 2",
      spec: { valueType: "string", control: "choice", options: { source: "static", items: departmentChoiceItems, visibleCount: 6 } },
      value: spacePreferences.preferredDepartmentIds[1] ? String(spacePreferences.preferredDepartmentIds[1]) : "",
      placeholder: "选择部门",
      onChange: (value: unknown) => spacePreferences.setPreferredDepartmentAt(1, value),
    },
    {
      key: "preferred-department-3",
      label: "部门 3",
      spec: { valueType: "string", control: "choice", options: { source: "static", items: departmentChoiceItems, visibleCount: 6 } },
      value: spacePreferences.preferredDepartmentIds[2] ? String(spacePreferences.preferredDepartmentIds[2]) : "",
      placeholder: "选择部门",
      onChange: (value: unknown) => spacePreferences.setPreferredDepartmentAt(2, value),
    },
    {
      key: "preferred-project-1",
      label: "常用项目",
      spec: { valueType: "string", control: "choice", options: { source: "static", items: projectChoiceItems, visibleCount: 6 } },
      value: spacePreferences.preferredProjectIds[0] ? String(spacePreferences.preferredProjectIds[0]) : "",
      placeholder: "选择项目",
      onChange: (value: unknown) => spacePreferences.setPreferredProjectAt(0, value),
    },
    {
      key: "preferred-project-2",
      label: "项目 2",
      spec: { valueType: "string", control: "choice", options: { source: "static", items: projectChoiceItems, visibleCount: 6 } },
      value: spacePreferences.preferredProjectIds[1] ? String(spacePreferences.preferredProjectIds[1]) : "",
      placeholder: "选择项目",
      onChange: (value: unknown) => spacePreferences.setPreferredProjectAt(1, value),
    },
    {
      key: "preferred-project-3",
      label: "项目 3",
      spec: { valueType: "string", control: "choice", options: { source: "static", items: projectChoiceItems, visibleCount: 6 } },
      value: spacePreferences.preferredProjectIds[2] ? String(spacePreferences.preferredProjectIds[2]) : "",
      placeholder: "选择项目",
      onChange: (value: unknown) => spacePreferences.setPreferredProjectAt(2, value),
    },
  ];
  const profileSection = {
    ...createFieldsSection("profile-table", profileItems, { kind: "detail", layout: { columns: 3 } }),
    header: { title: "账号信息" },
  };
  const portalSlotsSection = {
    key: "portal-slots",
    header: { title: "桌面卡槽" },
    body: {
      kind: "section" as const,
      moduleGrid: {
        items: portalSlotGridItems,
      },
      modals: editingPortalSlotIndex === null ? [] : [{
        key: "portal-slot-editor",
        open: true,
        title: editingPortalEntry?.label ?? "选择入口",
        onClose: () => setEditingPortalSlotIndex(null),
        size: "sm" as const,
        sections: [
          createFieldsSection("portal-slot-editor-fields", [{
            key: "portal-slot-entry",
            label: "入口",
            spec: {
              valueType: "string",
              control: "choice",
              state: portalSlotsSaving ? "disabled" : "normal",
              options: { source: "static",items: portalSlotChoiceItems(editingPortalSlotIndex), visibleCount: 8 },
            },
            value: editingPortalSlot?.key ?? "",
            placeholder: "选择 L1 / L2 入口",
            onChange: (value: unknown) => setPortalSlotKey(editingPortalSlotIndex, value),
          }], {
            kind: "fields",
            layout: { flow: "inline", columns: 1, density: "compact" },
            actions: [
              {
                key: "pin-portal-slot",
                action: "link",
                label: editingPortalSlot?.pinned ? "已设快捷" : "设为快捷",
                disabled: portalSlotsSaving || !editingPortalSlot?.key,
                onClick: () => togglePortalSlotPinned(editingPortalSlotIndex),
              },
              {
                key: "clear-portal-slot",
                action: "remove",
                label: "清空",
                disabled: portalSlotsSaving || !editingPortalSlot?.key,
                onClick: () => clearPortalSlot(editingPortalSlotIndex),
              },
            ],
          }),
        ],
      }],
    },
  };
  const accountTopSections: BodySurfaceSectionSpec[] = [
    profileSection,
    portalSlotsSection,
  ];
  const accountToolbarItems: SurfaceToolbarItem[] = [
    ...(apiAccess?.toolbarItems ?? []),
  ];
  const sections: BodySurfaceSectionSpec[] = [
    createSectionsSection("account-top", { sections: accountTopSections }),
  ];
  const navigation = createPageTabBar({
    items: [
      { key: "profile", label: "账号设定" },
      { key: "inbox", label: "收件箱" },
    ],
    active: accountPageTab,
    onChange: (key) => {
      if (isAccountPageTab(key)) switchAccountPageTab(key);
    },
    variant: "large",
    ariaLabel: "账号与接入",
  });
  return (
    <div className="space-y-4">
      {accountPageTab === "profile" ? (
        <PageSurface
          kind="standard"
          tabbar={navigation}
          toolbar={{ items: accountToolbarItems }}
          body={createPageBody(sections)}
        />
      ) : (
        <AccountNotificationsPanel
          navigation={navigation}
          currentUserId={user.id}
          workflowDetailRenderer={workflowDetailRenderer}
        />
      )}
    </div>
  );
}
