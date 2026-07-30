"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Home, Inbox, UserRound } from "lucide-react";
import { ActionGlyph, createFieldsSection, createSectionsSection, createPageBody, createPageTabBar, PageSurface, type BodySurfaceSectionSpec, type FormSurfaceItemSpec, type SurfaceToolbarItem, useFeedback } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { MAX_PRIMARY_PORTAL_SLOTS, normalizePortalSlots, type PortalEntry, type PortalSlot } from "@workspace/platform/portal-preferences";
import {
  accessiblePortalEntries,
  defaultSlotsForUser,
  fetchPortalSlotSettings,
  savePortalSlots,
} from "@workspace/platform/ui/portal-preferences";
import { accountProfileFromUser, fetchAccountProfile, formatAccountPhoneInput, normalizeAccountPhoneInput, normalizeAccountProfile, readAccountAliasTags, sameAccountProfile, saveAccountProfile, serializeAccountAliasTags, type AccountProfileForm } from "./account-profile";
import { useAccountAvatarField } from "./AccountAvatarField";
import { useAccountSpacePreferences } from "./AccountSpacePreferences";
import { useApiAccessSection, type ApiAccessModuleRow } from "./ApiAccessClient";
import AccountNotificationsPanel, { type AccountWorkflowDetailRenderer } from "./AccountNotificationsPanel";
import AccountNotificationSubscriptionsPanel from "./AccountNotificationSubscriptionsPanel";
type AccountPageTab = "profile" | "inbox" | "subscriptions";
const ACCOUNT_PAGE_TABS: AccountPageTab[] = ["profile", "inbox", "subscriptions"];
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
  if (value === "inbox" || value === "notifications") return "inbox";
  return value === "subscriptions" ? "subscriptions" : "profile";
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
  const [portalPickerParentKey, setPortalPickerParentKey] = useState<string | null>(null);
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
      if (isAccountPageTab(detail) || detail === "notifications") setAccountPageTab(parseAccountPageTab(detail));
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
          feedback.error(error instanceof Error ? error.message : "加载个性化桌面失败");
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
    if (portalSlotsSaving) return false;
    const previousSlots = portalSlots;
    const normalized = normalizeNextPortalSlots(nextSlots);
    setPortalSlots(normalized);
    setPortalSlotsSaving(true);
    try {
      const data = await savePortalSlots(normalized);
      setPortalSlots(data.slots);
      feedback.success("个性化桌面已更新");
      return true;
    } catch (error) {
      setPortalSlots(previousSlots);
      feedback.error(error instanceof Error ? error.message : "保存个性化桌面失败");
      return false;
    } finally {
      setPortalSlotsSaving(false);
    }
  }
  async function setPortalSlotKey(index: number, value: unknown) {
    const key = String(value || "").trim() || null;
    const next = portalSlots.map((slot, slotIndex) => (
      slotIndex === index ? { key, pinned: index >= MAX_PRIMARY_PORTAL_SLOTS } : slot
    ));
    if (await persistPortalSlots(next)) closePortalSlotPicker();
  }
  async function clearPortalSlot(index: number) {
    const next = portalSlots.map((slot, slotIndex) => (
      slotIndex === index ? { key: null, pinned: index >= MAX_PRIMARY_PORTAL_SLOTS } : slot
    ));
    if (await persistPortalSlots(next)) closePortalSlotPicker();
  }
  async function resetPortalSlots() {
    if (await persistPortalSlots(defaultSlotsForUser(user))) closePortalSlotPicker();
  }
  function openPortalSlotPicker(index: number) {
    setPortalPickerParentKey(null);
    setEditingPortalSlotIndex(index);
  }
  function closePortalSlotPicker() {
    setPortalPickerParentKey(null);
    setEditingPortalSlotIndex(null);
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
  function portalSlotChoiceItems(index: number, parentKey: string | null) {
    const groupStart = index < MAX_PRIMARY_PORTAL_SLOTS ? 0 : MAX_PRIMARY_PORTAL_SLOTS;
    const groupEnd = index < MAX_PRIMARY_PORTAL_SLOTS ? MAX_PRIMARY_PORTAL_SLOTS : portalSlots.length;
    const selectedElsewhere = new Set(portalSlots
      .slice(groupStart, groupEnd)
      .map((slot, groupIndex) => groupStart + groupIndex === index ? null : slot.key)
      .filter((key): key is string => Boolean(key)));
    const choices = parentKey
      ? portalEntries.filter((entry) => entry.key === parentKey || entry.parentKey === parentKey)
      : portalEntries.filter((entry) => entry.level === 1);
    return choices
      .filter((entry) => !parentKey || !selectedElsewhere.has(entry.key))
      .map((entry) => ({
        key: entry.key,
        value: entry,
        card: {
          title: entry.label,
          subtitle: entry.desc,
          code: parentKey && entry.level === 1 ? "模块首页" : entry.level === 1 ? "一级" : "二级",
          codeTone: entry.level === 1 ? "success" as const : "default" as const,
          active: portalSlots[index]?.key === entry.key,
          size: "sm" as const,
        },
      }));
  }
  const portalEntryByKey = new Map(portalEntries.map((entry) => [entry.key, entry]));
  const portalSlotGridItems = portalSlots.map((slot, index) => {
    const entry = slot.key ? portalEntryByKey.get(slot.key) : null;
    return {
      key: `portal-slot-${index}`,
      title: entry?.label ?? "选择入口",
      description: entry?.desc ?? (index < MAX_PRIMARY_PORTAL_SLOTS ? "选择桌面入口" : "选择移动端快捷入口"),
      icon: entry?.icon ?? <ActionGlyph kind="add" />,
      color: entry?.color ?? "emerald",
      badge: index >= MAX_PRIMARY_PORTAL_SLOTS ? "快捷" : undefined,
      onClick: () => openPortalSlotPicker(index),
    };
  });
  const editingPortalSlot = editingPortalSlotIndex === null ? null : portalSlots[editingPortalSlotIndex] ?? null;
  const editingPortalSlotLabel = editingPortalSlotIndex === null
    ? null
    : editingPortalSlotIndex < MAX_PRIMARY_PORTAL_SLOTS
      ? `桌面卡片 ${editingPortalSlotIndex + 1}`
      : `快捷方式 ${editingPortalSlotIndex - MAX_PRIMARY_PORTAL_SLOTS + 1}`;
  const pickerParent = portalPickerParentKey ? portalEntryByKey.get(portalPickerParentKey) ?? null : null;
  function selectPortalEntry(entry: PortalEntry) {
    if (editingPortalSlotIndex === null) return;
    if (!portalPickerParentKey) {
      setPortalPickerParentKey(entry.key);
      return;
    }
    void setPortalSlotKey(editingPortalSlotIndex, entry.key);
  }
  const mobileBottomGridItems = [
    { key: "mobile-bottom-home", title: "桌面", description: "固定入口", icon: <Home aria-hidden="true" className="h-6 w-6" />, color: "emerald" },
    ...portalSlotGridItems.slice(MAX_PRIMARY_PORTAL_SLOTS, MAX_PRIMARY_PORTAL_SLOTS + 2),
    { key: "mobile-bottom-inbox", title: "消息", description: "固定入口", icon: <Inbox aria-hidden="true" className="h-6 w-6" />, color: "blue" },
    { key: "mobile-bottom-account", title: "我的", description: "固定入口", icon: <UserRound aria-hidden="true" className="h-6 w-6" />, color: "indigo" },
  ];
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
  const portalSlotsSection: BodySurfaceSectionSpec = {
    key: "portal-slots",
    header: editingPortalSlotIndex === null ? {
      title: "个性化桌面",
      actions: [{
        key: "reset-portal-slots",
        label: "恢复默认设置",
        icon: "reset",
        disabled: portalSlotsSaving,
        onClick: () => void resetPortalSlots(),
      }],
    } : {
      title: pickerParent ? `选择${pickerParent.label}入口` : `选择${editingPortalSlotLabel}`,
      actions: [
        {
          key: "back-portal-slots",
          label: pickerParent ? "返回一级入口" : "返回个性化桌面",
          icon: "back",
          disabled: portalSlotsSaving,
          onClick: () => pickerParent ? setPortalPickerParentKey(null) : closePortalSlotPicker(),
        },
        {
          key: "clear-portal-slot",
          label: "清空当前位置",
          icon: "delete-minus",
          disabled: portalSlotsSaving || !editingPortalSlot?.key,
          onClick: () => void clearPortalSlot(editingPortalSlotIndex),
        },
      ],
    },
    body: editingPortalSlotIndex === null ? {
      kind: "section",
      sections: [
        {
          key: "primary-portal-slots",
          header: { title: "自选桌面卡片" },
          body: { kind: "section", moduleGrid: { items: portalSlotGridItems.slice(0, MAX_PRIMARY_PORTAL_SLOTS) } },
        },
        {
          key: "shortcut-portal-slots",
          header: { title: "移动端底栏" },
          body: { kind: "section", moduleGrid: { items: mobileBottomGridItems, columns: 5 } },
        },
      ],
    } : {
      kind: "selector",
      selector: {
        kind: "list",
        items: portalSlotChoiceItems(editingPortalSlotIndex, portalPickerParentKey),
        selectedId: editingPortalSlot?.key ?? null,
        emptyText: "暂无可用入口",
        onSelect: selectPortalEntry,
        size: "sm",
      },
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
    createSectionsSection("account-top", { sections: accountTopSections, mobilePresentation: "drilldown" }),
  ];
  const navigation = createPageTabBar({
    items: [
      { key: "profile", label: "账号设定" },
      { key: "inbox", label: "收件箱" },
      { key: "subscriptions", label: "通知与订阅" },
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
      ) : accountPageTab === "inbox" ? (
        <AccountNotificationsPanel
          navigation={navigation}
          currentUserId={user.id}
          workflowDetailRenderer={workflowDetailRenderer}
        />
      ) : (
        <AccountNotificationSubscriptionsPanel navigation={navigation} />
      )}
    </div>
  );
}
