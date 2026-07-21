"use client";

import { useDeferredValue, useState } from "react";
import {
  createFieldsSection,
  createPageBody,
  createPageModalSection,
  createPageTableSection,
  createStatusSection,
  PageSurface,
  useFeedback,
  type BodySurfaceBodyInputSpec,
  type BodySurfaceSectionSpec,
  type PageSurfaceTabBarSpec,
} from "@workspace/core/ui";
import { postJson, putJson, requestJson } from "@workspace/platform/ui/api-client";
import type { CompanyRecord, CompanyRelationRecord } from "../types";
import {
  COMPANY_COLUMNS,
  COMPANY_VISIBLE_COLUMNS,
  EMPTY_COMPANY_DRAFT,
  EMPTY_RELATION_DRAFT,
  RELATION_COLUMNS,
  RELATION_VISIBLE_COLUMNS,
  companyFormSections,
  relationFormSections,
  type CompanyDraft,
  type CompanyRelationDraft,
} from "./company-governance-ui";
import { useCompanyGovernanceData } from "./useCompanyGovernanceData";

const COMPANIES_ENDPOINT = "/api/modules/capitalSecurities/governance/companies";
const RELATIONS_ENDPOINT = "/api/modules/capitalSecurities/governance/company-relations";

export default function CompanyGovernanceClient({
  view,
  navigation,
  canCreate,
  canUpdate,
  canDelete,
}: {
  view: "companies" | "relations";
  navigation: PageSurfaceTabBarSpec;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const feedback = useFeedback();
  const [keyword, setKeyword] = useState("");
  const deferredKeyword = useDeferredValue(keyword);
  const [companyDraft, setCompanyDraft] = useState<CompanyDraft | null>(null);
  const [relationDraft, setRelationDraft] = useState<CompanyRelationDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const { companies, relations, total, loading, error, load } = useCompanyGovernanceData(view, deferredKeyword);

  const sections: BodySurfaceBodyInputSpec[] = [
    ...(loading ? [createStatusSection("company-governance-loading", { kind: "loading", content: "正在加载公司治理资料" })] : []),
    ...(error ? [createStatusSection("company-governance-error", { kind: "error", content: error })] : []),
    ...(!loading && !error ? [view === "companies" ? companyTable() : relationTable()] : []),
    ...(view === "companies" ? companyCreateSection() : relationCreateSection()),
    ...editModalSections(),
  ];

  return (
    <PageSurface
      kind="standard"
      tabbar={navigation}
      toolbar={{
        items: [
          { kind: "search", key: "search", value: keyword, onChange: setKeyword, placeholder: view === "companies" ? "搜索公司" : "搜索持股方或被持股方" },
          { kind: "text", key: "total", content: `共 ${total} 条` },
        ],
        onSubmit: load,
      }}
      body={createPageBody(sections)}
    />
  );

  function companyTable() {
    return createPageTableSection("companies", {
      rows: companies,
      columns: COMPANY_COLUMNS,
      visibleColumns: COMPANY_VISIBLE_COLUMNS,
      rowKey: (row: CompanyRecord) => row.id,
      emptyText: "暂无公司信息",
      presentation: { density: "compact" as const },
      rowActions: canUpdate ? (row: CompanyRecord) => [{
        key: "edit",
        kind: "edit" as const,
        label: "编辑公司",
        disabled: saving,
        onClick: () => setCompanyDraft({ ...row }),
      }] : undefined,
    });
  }

  function relationTable() {
    return createPageTableSection("company-relations", {
      rows: relations,
      columns: RELATION_COLUMNS,
      visibleColumns: RELATION_VISIBLE_COLUMNS,
      rowKey: (row: CompanyRelationRecord) => row.id,
      emptyText: "暂无股权关系",
      presentation: { density: "compact" as const },
      rowActions: canUpdate || canDelete ? (row: CompanyRelationRecord) => [
        ...(canUpdate ? [{ key: "edit", kind: "edit" as const, label: "编辑关系", disabled: saving, onClick: () => setRelationDraft(toRelationDraft(row)) }] : []),
        ...(canDelete ? [{ key: "delete", kind: "delete" as const, label: "删除关系", disabled: saving, onClick: () => void removeRelation(row) }] : []),
      ] : undefined,
    });
  }

  function companyCreateSection(): BodySurfaceSectionSpec[] {
    return [{ key: "company-create", chrome: "plain", body: { kind: "create", create: {
      id: "company-create",
      trigger: "toolbar",
      presentation: "modal",
      title: "新增公司",
      open: Boolean(companyDraft && !companyDraft.id),
      canCreate,
      disabled: saving,
      content: { kind: "sections", sections: companyFormSections(companyDraft ?? EMPTY_COMPANY_DRAFT, updateCompanyDraft, companies) },
      submission: { action: "save", disabled: saving || !companyDraft?.code || !companyDraft.name, execute: saveCompany },
      onOpenChange: (open) => setCompanyDraft(open ? { ...EMPTY_COMPANY_DRAFT } : null),
      onCancel: () => setCompanyDraft(null),
    } } }];
  }

  function relationCreateSection(): BodySurfaceSectionSpec[] {
    return [{ key: "relation-create", chrome: "plain", body: { kind: "create", create: {
      id: "company-relation-create",
      trigger: "toolbar",
      presentation: "modal",
      title: "新增股权关系",
      open: Boolean(relationDraft && !relationDraft.id),
      canCreate,
      disabled: saving,
      content: { kind: "sections", sections: relationFormSections(relationDraft ?? EMPTY_RELATION_DRAFT, updateRelationDraft, companies) },
      submission: { action: "save", disabled: saving || !relationDraft?.parentId || !relationDraft.childId, execute: saveRelation },
      onOpenChange: (open) => setRelationDraft(open ? { ...EMPTY_RELATION_DRAFT } : null),
      onCancel: () => setRelationDraft(null),
    } } }];
  }

  function editModalSections(): BodySurfaceBodyInputSpec[] {
    if (companyDraft?.id) {
      return [createPageModalSection("company-edit", {
        open: true,
        title: "编辑公司",
        size: "lg",
        onClose: () => setCompanyDraft(null),
        sections: companyFormSections(companyDraft, updateCompanyDraft, companies).map((section) => createFieldsSection(`company-edit-${section.key}`, section.items, { header: section.title ? { title: section.title } : undefined, layout: section.layout })),
        actions: [
          { key: "cancel", label: "取消", onClick: () => setCompanyDraft(null), disabled: saving },
          { key: "save", label: saving ? "保存中..." : "保存", icon: "save", variant: "primary", onClick: () => void saveCompany(), disabled: saving || !companyDraft.code || !companyDraft.name },
        ],
      })];
    }
    if (relationDraft?.id) {
      return [createPageModalSection("relation-edit", {
        open: true,
        title: "编辑股权关系",
        size: "md",
        onClose: () => setRelationDraft(null),
        sections: relationFormSections(relationDraft, updateRelationDraft, companies).map((section) => createFieldsSection(`relation-edit-${section.key}`, section.items, { header: section.title ? { title: section.title } : undefined, layout: section.layout })),
        actions: [
          { key: "cancel", label: "取消", onClick: () => setRelationDraft(null), disabled: saving },
          { key: "save", label: saving ? "保存中..." : "保存", icon: "save", variant: "primary", onClick: () => void saveRelation(), disabled: saving || !relationDraft.parentId || !relationDraft.childId },
        ],
      })];
    }
    return [];
  }

  function updateCompanyDraft<K extends keyof CompanyDraft>(key: K, value: CompanyDraft[K]) {
    setCompanyDraft((current) => current ? { ...current, [key]: value } : current);
  }

  function updateRelationDraft<K extends keyof CompanyRelationDraft>(key: K, value: CompanyRelationDraft[K]) {
    setRelationDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function saveCompany() {
    if (!companyDraft) throw new Error("公司资料未填写");
    setSaving(true);
    try {
      const update = Boolean(companyDraft.id);
      if (update) await putJson(COMPANIES_ENDPOINT, companyDraft, "保存公司失败");
      else await postJson(COMPANIES_ENDPOINT, companyDraft, "新增公司失败");
      setCompanyDraft(null);
      await load();
      if (update) feedback.success("公司已保存");
      return { outcome: "saved" as const, message: "公司已新增" };
    } finally {
      setSaving(false);
    }
  }

  async function saveRelation() {
    if (!relationDraft) throw new Error("股权关系未填写");
    setSaving(true);
    try {
      const update = Boolean(relationDraft.id);
      if (update) await putJson(RELATIONS_ENDPOINT, relationDraft, "保存股权关系失败");
      else await postJson(RELATIONS_ENDPOINT, relationDraft, "新增股权关系失败");
      setRelationDraft(null);
      await load();
      if (update) feedback.success("股权关系已保存");
      return { outcome: "saved" as const, message: "股权关系已新增" };
    } finally {
      setSaving(false);
    }
  }

  async function removeRelation(row: CompanyRelationRecord) {
    if (!await feedback.confirmDelete({ message: `确定删除“${row.parentName} → ${row.childName}”这条股权关系吗？` })) return;
    setSaving(true);
    try {
      await requestJson(`${RELATIONS_ENDPOINT}/${row.id}`, { method: "DELETE", headers: { "If-Match": String(row.version) }, fallbackMessage: "删除股权关系失败" });
      feedback.success("股权关系已删除");
      await load();
    } catch (caught) {
      feedback.error(caught instanceof Error ? caught.message : "删除股权关系失败");
    } finally {
      setSaving(false);
    }
  }
}

function toRelationDraft(row: CompanyRelationRecord): CompanyRelationDraft {
  return {
    id: row.id,
    version: row.version,
    parentId: row.parentId,
    childId: row.childId,
    shareRatio: row.shareRatio,
    isConsolidated: row.isConsolidated,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
  };
}
