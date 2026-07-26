"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  createAnalysisSection,
  createEmptySection,
  createMasterDetailBody,
  createPageBody,
  createPageTableSection,
  createPanelSection,
  PageSurface,
  type BodySurfaceSectionSpec,
  type PageSurfaceTabBarSpec,
  type SelectorSurfaceProps,
} from "@workspace/core/ui";
import type { CompanyRecord, OwnershipInterestRecord } from "../types";
import {
  OWNERSHIP_COLUMNS,
  OWNERSHIP_HISTORY_COLUMNS,
  OWNERSHIP_HISTORY_VISIBLE_COLUMNS,
  OWNERSHIP_VISIBLE_COLUMNS,
} from "./company-governance-ui";
import { useCompanyGovernanceData } from "./useCompanyGovernanceData";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";

export default function GovernanceOwnershipClient({ navigation }: {
  navigation: PageSurfaceTabBarSpec;
}) {
  const businessTimeZone = useTenantConfig().localization.businessTimeZone;
  const [keyword, setKeyword] = useState("");
  const deferredKeyword = useDeferredValue(keyword);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [mobileDetailActive, setMobileDetailActive] = useState(false);
  const { companies, ownershipInterests, companyTotal, loading, error, load } = useCompanyGovernanceData(deferredKeyword);

  const selectedCompany = companies.find((company) => company.id === selectedCompanyId) ?? companies[0] ?? null;
  const selectedInterests = useMemo(
    () => selectedCompany == null
      ? []
      : ownershipInterests.filter((interest) => (
          interest.ownerPartyId === selectedCompany.partyId || interest.issuerCompanyId === selectedCompany.id
        )),
    [ownershipInterests, selectedCompany],
  );
  const currentDate = currentBusinessDate(businessTimeZone);
  const currentInterests = useMemo(
    () => selectedInterests.filter((interest) => isEffectiveOwnershipInterest(interest, currentDate)),
    [currentDate, selectedInterests],
  );
  const historicalInterests = useMemo(
    () => [...selectedInterests].sort((left, right) => (
      (right.effectiveFrom ?? "").localeCompare(left.effectiveFrom ?? "") || right.id - left.id
    )),
    [selectedInterests],
  );

  useEffect(() => {
    if (selectedCompanyId === null && companies[0]) setSelectedCompanyId(companies[0].id);
  }, [companies, selectedCompanyId]);

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
        status: { label: company.isActive ? "启用" : "停用", tone: company.isActive ? "success" : "muted" },
      },
    })),
    selectedId: selectedCompany?.id ?? null,
    loading,
    loadingText: "正在加载集团公司",
    emptyText: error || "暂无集团公司",
    onSelect: (company) => {
      setSelectedCompanyId(company.id);
      setMobileDetailActive(true);
    },
  };

  return (
    <PageSurface
      kind="standard"
      tabbar={navigation}
      toolbar={{
        items: [
          { kind: "search", key: "search", value: keyword, onChange: setKeyword, placeholder: "搜索集团公司" },
          { kind: "text", key: "scope", content: "由股权事件账本自动生成" },
        ],
        onSubmit: load,
      }}
      body={createMasterDetailBody({
        master: { label: "集团公司", presentation: "compact", body: { kind: "selector", selector } },
        detail: createPageBody(rightSections()),
        desktop: { ratio: [3, 7] },
        mobile: { detailActive: mobileDetailActive, onNavigateToList: () => setMobileDetailActive(false) },
      })}
    />
  );

  function rightSections(): BodySurfaceSectionSpec[] {
    if (!selectedCompany) {
      return [createEmptySection("governance-ownership-empty", {
        presentation: "plain",
        content: loading ? "正在加载集团股权结构" : "选择左侧公司查看直接持股关系",
      })];
    }
    return [createPanelSection("governance-ownership", {
      title: `${selectedCompany.name} · 集团股权结构`,
      sections: [
        createAnalysisSection("governance-current-ownership", {
          title: "当前集团股权",
          sections: [createPageTableSection("governance-current-ownership-table", {
            rows: currentInterests,
            columns: OWNERSHIP_COLUMNS,
            visibleColumns: OWNERSHIP_VISIBLE_COLUMNS,
            rowKey: (row) => row.id,
            loading,
            emptyText: "当前公司暂无有效的集团直接持股关系",
            presentation: { density: "compact", cellWrap: "nowrap" },
          })],
        }),
        createAnalysisSection("governance-ownership-history", {
          title: "集团股权变更记录",
          sections: [createPageTableSection("governance-ownership-history-table", {
            rows: historicalInterests,
            columns: OWNERSHIP_HISTORY_COLUMNS,
            visibleColumns: OWNERSHIP_HISTORY_VISIBLE_COLUMNS,
            rowKey: (row) => row.id,
            loading,
            emptyText: "当前公司暂无集团股权变更记录",
            presentation: { density: "compact", cellWrap: "nowrap" },
          })],
        }),
      ],
    })];
  }

}

function isEffectiveOwnershipInterest(row: OwnershipInterestRecord, asOf: string) {
  return row.recordStatus === "confirmed"
    && (row.effectiveFrom === null || row.effectiveFrom <= asOf)
    && (row.effectiveTo === null || row.effectiveTo >= asOf);
}

function currentBusinessDate(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
