"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  createAnalysisSection,
  createEmptySection,
  createFieldsSection,
  createMasterDetailBody,
  createPageBody,
  createPanelSection,
  createPageTableSection,
  PageSurface,
  useFeedback,
  type BodySurfaceSectionSpec,
  type CreateSurfaceToolbarProps,
  type PageSurfaceTabBarSpec,
  type SelectorSurfaceProps,
} from "@workspace/core/ui";
import { postDirectCommandJson, putDirectCommandJson } from "@workspace/platform/ui/api-client";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";
import type { CompanyRecord } from "../types";
import {
  COMPANY_REGISTRY_CHANGE_COLUMNS,
  COMPANY_REGISTRY_CHANGE_VISIBLE_COLUMNS,
  companyFormSections,
  createEmptyCompanyDraft,
  type CompanyDraft,
} from "./company-governance-ui";
import { useCompanyGovernanceData } from "./useCompanyGovernanceData";

const COMPANIES_ENDPOINT = "/api/modules/capitalSecurities/governance/companies";

export default function CompanyGovernanceClient({
  navigation,
  canCreate,
  canUpdate,
}: {
  navigation: PageSurfaceTabBarSpec;
  canCreate: boolean;
  canUpdate: boolean;
}) {
  const managementGroups = useTenantConfig().organization.managementGroups;
  const emptyCompanyDraft = createEmptyCompanyDraft(managementGroups.default);
  const feedback = useFeedback();
  const [keyword, setKeyword] = useState("");
  const deferredKeyword = useDeferredValue(keyword);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [companyDraft, setCompanyDraft] = useState<CompanyDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [mobileDetailActive, setMobileDetailActive] = useState(false);
  const {
    companies,
    companyTotal,
    loading,
    error,
    load,
  } = useCompanyGovernanceData(deferredKeyword, false);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );

  useEffect(() => {
    if (companyDraft && !companyDraft.id) return;
    const nextCompany = selectedCompany ?? companies[0] ?? null;
    if (!nextCompany) {
      setSelectedCompanyId(null);
      setCompanyDraft(null);
      return;
    }
    if (selectedCompanyId !== nextCompany.id) setSelectedCompanyId(nextCompany.id);
    setCompanyDraft((current) => current?.id === nextCompany.id ? current : toCompanyDraft(nextCompany));
  }, [companies, companyDraft, selectedCompany, selectedCompanyId]);

  const selector: SelectorSurfaceProps<CompanyRecord> = {
    kind: "list",
    title: `公司 · ${companyTotal}`,
    items: companies.map((company) => ({
      key: company.id,
      value: company,
      card: {
        title: company.name,
        subtitle: company.fullName || company.unifiedCode || undefined,
        code: company.code,
        status: {
          label: company.isActive ? "启用" : "停用",
          tone: company.isActive ? "success" : "muted",
        },
      },
    })),
    selectedId: selectedCompanyId,
    loading,
    loadingText: "正在加载公司",
    emptyText: error || "暂无公司信息",
    onSelect: selectCompany,
  };

  return (
    <PageSurface
      kind="standard"
      tabbar={navigation}
      toolbar={{
        items: [
          {
            kind: "search",
            key: "search",
            value: keyword,
            onChange: setKeyword,
            placeholder: "搜索公司",
          },
          { kind: "text", key: "total", content: `共 ${companyTotal} 家` },
        ],
        onSubmit: load,
      }}
      body={createMasterDetailBody({
        master: { label: "公司", presentation: "compact", body: { kind: "selector", selector } },
        detail: rightBody(),
        desktop: { ratio: [3, 7] },
        mobile: { detailActive: mobileDetailActive, onNavigateToList: () => setMobileDetailActive(false) },
      })}
    />
  );

  function rightBody() {
    const createSection: BodySurfaceSectionSpec = {
      key: "company-create",
      body: { kind: "create", create: companyCreateSurface() },
    };
    if (companyDraft && !companyDraft.id) {
      return createPageBody([createSection]);
    }
    if (!companyDraft || !selectedCompany) {
      return createPageBody([
        createSection,
        createEmptySection("company-empty", {
          presentation: "plain",
          content: loading ? "正在加载公司信息" : "选择左侧公司维护资料",
        }),
      ]);
    }
    return createPageBody([
      createSection,
      companyInformationPanel(companyDraft),
    ]);
  }

  function companyInformationPanel(draft: CompanyDraft): BodySurfaceSectionSpec {
    const formSections = companyFormSections(
      draft,
      updateCompanyDraft,
      canUpdate,
    );
    return createPanelSection("company-information", {
      title: draft.name,
      sections: [
        ...formSections.map((section, index) => createFieldsSection(
          `company-information-${section.key}`,
          section.items,
          {
            header: section.title ? { title: section.title } : undefined,
            layout: section.layout,
            actions: canUpdate && index === formSections.length - 1 ? [
              {
                key: "reset",
                action: "cancel",
                label: "撤销修改",
                disabled: saving,
                onClick: resetCompanyDraft,
              },
              {
                key: "save",
                action: "save",
                label: saving ? "保存中..." : "保存",
                disabled: saving || !draft.code || !draft.name,
                onClick: () => void saveCompany(),
              },
            ] : undefined,
          },
        )),
        createAnalysisSection("company-registry-history", {
          title: "法人代表与股权变更历史",
          sections: [createPageTableSection("company-registry-history-table", {
            rows: selectedCompany?.registryChanges ?? [],
            columns: COMPANY_REGISTRY_CHANGE_COLUMNS,
            visibleColumns: COMPANY_REGISTRY_CHANGE_VISIBLE_COLUMNS,
            rowKey: (row) => row.id,
            loading,
            emptyText: "暂无工商治理变更记录",
            presentation: { density: "compact", cellWrap: "wrap" },
          })],
        }),
      ],
    });
  }

  function companyCreateSurface(): CreateSurfaceToolbarProps {
    return {
      id: "company-create",
      trigger: "toolbar",
      presentation: "block",
      title: "新增公司",
      open: Boolean(companyDraft && !companyDraft.id),
      canCreate,
      disabled: saving,
      content: {
        kind: "sections",
        sections: companyFormSections(
          companyDraft ?? emptyCompanyDraft,
          updateCompanyDraft,
          canCreate,
        ),
      },
      submission: {
        action: "save",
        disabled: saving || !companyDraft?.code || !companyDraft.name,
        execute: () => saveCompany({ surface: true }),
      },
      feedback: { saved: "公司已新增", error: "新增公司失败" },
      onOpenChange: (open) => open ? openCompanyCreate() : cancelCompanyCreate(),
      onCancel: cancelCompanyCreate,
    };
  }

  function openCompanyCreate() {
    setSelectedCompanyId(null);
    setCompanyDraft({ ...emptyCompanyDraft });
    setMobileDetailActive(true);
  }

  function cancelCompanyCreate() {
    const company = companies[0] ?? null;
    setSelectedCompanyId(company?.id ?? null);
    setCompanyDraft(company ? toCompanyDraft(company) : null);
    setMobileDetailActive(false);
  }

  function selectCompany(company: CompanyRecord) {
    setSelectedCompanyId(company.id);
    setCompanyDraft(toCompanyDraft(company));
    setMobileDetailActive(true);
  }

  function resetCompanyDraft() {
    if (selectedCompany) setCompanyDraft(toCompanyDraft(selectedCompany));
  }

  function updateCompanyDraft<K extends keyof CompanyDraft>(key: K, value: CompanyDraft[K]) {
    setCompanyDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function saveCompany(options?: { surface?: boolean }) {
    if (!companyDraft) throw new Error("公司资料未填写");
    setSaving(true);
    try {
      const update = Boolean(companyDraft.id);
      const response = update
        ? await putDirectCommandJson<{ success: true }>(COMPANIES_ENDPOINT, companyDraft, "保存公司失败")
        : await postDirectCommandJson<{ record: { id: number } }>(COMPANIES_ENDPOINT, companyDraft, "新增公司失败");
      const savedId = update ? companyDraft.id! : "record" in response ? response.record.id : null;
      if (!update) setKeyword("");
      const refreshed = await load(update ? undefined : "");
      const savedCompany = refreshed?.companies.find((company) => company.id === savedId) ?? null;
      setSelectedCompanyId(savedId);
      setCompanyDraft(savedCompany ? toCompanyDraft(savedCompany) : null);
      if (!options?.surface) feedback.success(update ? "公司已保存" : "公司已新增");
      return { outcome: "saved" as const };
    } catch (caught) {
      if (options?.surface) throw caught;
      feedback.error(caught instanceof Error ? caught.message : "保存公司失败");
    } finally {
      setSaving(false);
    }
  }

}

function toCompanyDraft(company: CompanyRecord): CompanyDraft {
  const { registryChanges: _registryChanges, ...draft } = company;
  return draft;
}
