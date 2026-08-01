"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";

import { workspacePath } from "@workspace/core/routing";
import {
  createAnalysisSection,
  createFieldsSection,
  createMasterDetailBody,
  createMessageSection,
  createMetricsSection,
  createPageBody,
  createPageTableSection,
  createPageTabBar,
  PageSurface,
  useFeedback,
  type BodySurfaceSectionSpec,
  type DataSurfaceColumnSpec,
  type FormSurfaceItemSpec,
  type PageSurfaceCreateSpec,
  type SelectorSurfaceProps,
} from "@workspace/core/ui";
import { postDirectCommandJson, putDirectCommandJson, requestJson } from "@workspace/platform/ui/api-client";

import type {
  InvestmentEnterpriseContractRecord,
  InvestmentEnterpriseDiligenceRecord,
  InvestmentEnterpriseMeetingRecord,
  InvestmentEnterpriseMonitoringRecord,
  InvestmentEnterpriseProfileRecord,
  InvestmentEnterpriseRecordKind,
  InvestmentEnterpriseSearchResponse,
  InvestmentEnterpriseWorkspace,
} from "../types/investment-enterprises";
import {
  CONTRACT_COLUMNS,
  DILIGENCE_COLUMNS,
  DOCUMENT_COLUMNS,
  emptyProfileDraft,
  emptyRecordDraft,
  formatAmount,
  INVESTMENT_SHAREHOLDER_COLUMNS,
  INVESTMENT_SHAREHOLDER_VISIBLE_COLUMNS,
  MEETING_COLUMNS,
  MONITORING_COLUMNS,
  profileDraft,
  profileFields,
  recordDraft,
  recordFields,
  type InvestmentDraft,
} from "./investment-enterprise-ui";

const ENDPOINT = "/api/modules/capitalSecurities/investments";
type View = "overview" | "meetings" | "diligence" | "contracts" | "monitoring" | "documents";
type EditableRecord = InvestmentEnterpriseMeetingRecord | InvestmentEnterpriseDiligenceRecord | InvestmentEnterpriseContractRecord | InvestmentEnterpriseMonitoringRecord;

const VIEWS = [
  { key: "overview", label: "投资概览" }, { key: "meetings", label: "股东会" }, { key: "diligence", label: "尽调资料" },
  { key: "contracts", label: "相关合同" }, { key: "monitoring", label: "投后监控" }, { key: "documents", label: "智能资料" },
] as const;

export default function InvestmentEnterprisesClient({ canCreate, canUpdate, canImport }: { canCreate: boolean; canUpdate: boolean; canImport: boolean }) {
  const feedback = useFeedback();
  const [view, setView] = useState<View>("overview");
  const [keyword, setKeyword] = useState(""); const deferredKeyword = useDeferredValue(keyword);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [data, setData] = useState<InvestmentEnterpriseWorkspace | null>(null);
  const [profileEdit, setProfileEdit] = useState<InvestmentDraft | null>(null);
  const [profileCreate, setProfileCreate] = useState<InvestmentDraft | null>(null);
  const [recordEdit, setRecordEdit] = useState<{ kind: InvestmentEnterpriseRecordKind; draft: InvestmentDraft } | null>(null);
  const [recordCreate, setRecordCreate] = useState<InvestmentDraft | null>(null);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const [mobileDetailActive, setMobileDetailActive] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false); const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState("due_diligence"); const [uploadTitle, setUploadTitle] = useState(""); const [uploadNotes, setUploadNotes] = useState("");
  const [semanticQuery, setSemanticQuery] = useState(""); const [searching, setSearching] = useState(false); const [searchResult, setSearchResult] = useState<InvestmentEnterpriseSearchResponse | null>(null);

  const load = useCallback(async (profileId: number | null, search: string) => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams(); if (profileId) params.set("profileId", String(profileId)); if (search) params.set("keyword", search);
      const next = await requestJson<InvestmentEnterpriseWorkspace>(`${ENDPOINT}?${params}`);
      setData(next); setSelectedProfileId(next.selectedProfile?.id ?? null); setProfileEdit(next.selectedProfile ? profileDraft(next.selectedProfile) : null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "投资企业档案加载失败"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(null, ""); }, [load]);
  const selected = data?.selectedProfile ?? null;
  const navigation = useMemo(() => createPageTabBar({ items: [...VIEWS], active: view, onChange: (key) => { setView(key as View); setProfileCreate(null); setRecordCreate(null); setRecordEdit(null); setUploadOpen(false); }, ariaLabel: "投资企业档案视图" }), [view]);
  const selector = useMemo<SelectorSurfaceProps<InvestmentEnterpriseProfileRecord>>(() => ({
    kind: "list", title: `投资企业 · ${data?.profiles.length ?? 0}`,
    items: (data?.profiles ?? []).map((profile) => ({ key: profile.id, value: profile, card: {
      title: profile.companyName, subtitle: profile.industry || profile.companyFullName || undefined, code: profile.portfolioCode,
      meta: profile.investedAmount === null ? "投资额待补" : formatAmount(profile.investedAmount, profile.investmentCurrency),
      status: { label: statusLabel(profile.investmentStatus), tone: profile.investmentStatus === "watch" ? "warning" : profile.investmentStatus === "exited" ? "muted" : "success" },
    }})),
    selectedId: selectedProfileId, loading, loadingText: "正在加载投资企业", emptyText: error || "暂无投资企业档案",
    onSelect: (profile) => { setSelectedProfileId(profile.id); setMobileDetailActive(true); setSearchResult(null); void load(profile.id, deferredKeyword); },
  }), [data?.profiles, deferredKeyword, error, load, loading, selectedProfileId]);

  return <PageSurface
    kind="standard" tabbar={navigation} create={recordEdit || uploadOpen ? undefined : createSurface()}
    toolbar={{ items: view === "documents" ? [
      { kind: "search", key: "semantic-search", value: semanticQuery, onChange: setSemanticQuery, placeholder: "在本企业资料中语义检索" },
      { kind: "action-group", key: "document-actions", actions: [{ key: "search", kind: "search", label: searching ? "检索中" : "语义检索", disabled: !selected || semanticQuery.trim().length < 2 || searching, onClick: () => void semanticSearch() }, ...(canImport ? [{ key: "upload", kind: "upload" as const, label: "上传并分析", disabled: !selected || uploadOpen, onClick: openUpload }] : [])] },
    ] : [{ kind: "search", key: "company-search", value: keyword, onChange: setKeyword, placeholder: "搜索企业、行业或负责人" }, { kind: "text", key: "total", content: `共 ${data?.profiles.length ?? 0} 家` }], onSubmit: view === "documents" ? semanticSearch : () => load(selectedProfileId, deferredKeyword) }}
    body={createMasterDetailBody({
      master: { label: "投资企业", presentation: "compact", body: { kind: "selector", selector } },
      detail: detailBody(), desktop: { ratio: [3, 7] }, mobile: { detailActive: mobileDetailActive || Boolean(recordEdit) || uploadOpen, onNavigateToList: () => setMobileDetailActive(false) },
    })}
  />;

  function detailBody() {
    if (error) return createPageBody([createMessageSection("load-error", { tone: "danger", content: error })]);
    if (!selected || !data) return createPageBody([createMessageSection("empty", { tone: "muted", content: loading ? "正在加载投资企业" : "选择左侧企业查看档案，或新建一份投资档案" })]);
    if (recordEdit) return createPageBody([recordEditSection()]);
    if (uploadOpen) return createPageBody([documentUploadSection()]);
    return createPageBody(viewSections());
  }

  function viewSections(): BodySurfaceSectionSpec[] {
    if (!selected || !data) return [];
    if (view === "overview") return overviewSections();
    if (view === "meetings") return recordTable("meeting", data.meetings, MEETING_COLUMNS, "暂无股东会或治理事项");
    if (view === "diligence") return recordTable("diligence", data.diligenceItems, DILIGENCE_COLUMNS, "暂无尽调发现");
    if (view === "contracts") return recordTable("contract", data.contracts, CONTRACT_COLUMNS, "暂无相关合同");
    if (view === "monitoring") return recordTable("monitoring", data.monitoring, MONITORING_COLUMNS, "暂无投后经营快照");
    return documentSections();
  }

  function overviewSections(): BodySurfaceSectionSpec[] {
    if (!selected || !data || !profileEdit) return [];
    return [
      createMetricsSection("portfolio-metrics", { metrics: [
        { key: "invested", label: "累计投资", value: formatAmount(selected.investedAmount, selected.investmentCurrency) },
        { key: "valuation", label: "当前估值", value: formatAmount(selected.currentValuation, selected.investmentCurrency) },
        { key: "shareholders", label: "当前股东", value: data.shareholders.length }, { key: "diligence", label: "未闭环尽调", value: data.metrics.openDiligence },
        { key: "obligations", label: "30日内合同提醒", value: data.metrics.upcomingObligations }, { key: "documents", label: "智能资料", value: data.metrics.documentCount },
      ] }),
      createAnalysisSection("profile", { title: `${selected.companyName} · 投资档案`, sections: [createFieldsSection("profile-fields", profileFields({ draft: profileEdit, onChange: updateProfile }), { layout: { columns: 2 }, actions: canUpdate ? [
        { key: "reset", action: "cancel", label: "撤销修改", disabled: saving, onClick: () => setProfileEdit(profileDraft(selected)) },
        { key: "save", action: "save", label: saving ? "保存中..." : "保存", disabled: saving || !profileEdit.portfolioCode, onClick: () => void saveProfile() },
      ] : undefined })] }),
      createAnalysisSection("shareholders", { title: "当前股东（沿用股权投资口径）", sections: [createPageTableSection("shareholder-table", {
        rows: data.shareholders, columns: INVESTMENT_SHAREHOLDER_COLUMNS, visibleColumns: INVESTMENT_SHAREHOLDER_VISIBLE_COLUMNS, rowKey: (row) => row.partyId,
        emptyText: "尚未建立股权账本", presentation: { density: "compact", cellWrap: "nowrap" },
      })] }),
    ];
  }

  function recordTable<T extends EditableRecord>(kind: InvestmentEnterpriseRecordKind, rows: T[], columns: DataSurfaceColumnSpec<T>[], emptyText: string): BodySurfaceSectionSpec[] {
    return [createAnalysisSection(`${kind}-records`, { title: recordTitle(kind), sections: [createPageTableSection(`${kind}-table`, {
      rows, columns, visibleColumns: columns.map((column) => column.key), rowKey: (row) => row.id, emptyText,
      rowActions: canUpdate ? (row) => [{ key: "edit", kind: "edit", label: "编辑", onClick: () => setRecordEdit({ kind, draft: recordDraft(kind, row as unknown as Record<string, unknown>) }) }] : undefined,
      actionsColumn: canUpdate ? { label: "操作" } : undefined, presentation: { density: "compact", rowHover: canUpdate ? "interactive" : "neutral", cellWrap: "wrap" },
    })] })];
  }

  function documentSections(): BodySurfaceSectionSpec[] {
    if (!data) return [];
    const sections: BodySurfaceSectionSpec[] = [
      createMessageSection("document-policy", { tone: "muted", content: "原件进入资料库后保留不可变版本；OCR、文本分块与 Qwen 向量索引均记录处理代次。AI 结果只作为候选，不会自动改写投资档案。" }),
      createAnalysisSection("documents", { title: "企业资料", sections: [createPageTableSection("document-table", { rows: data.documents, columns: DOCUMENT_COLUMNS, visibleColumns: DOCUMENT_COLUMNS.map((column) => column.key), rowKey: (row) => row.id, emptyText: "暂无资料，上传 PDF、Word、Excel 或图片开始分析", presentation: { density: "compact", cellWrap: "wrap" } })] }),
    ];
    if (searchResult) sections.push(createAnalysisSection("semantic-results", { title: `语义检索结果${searchResult.modelKey ? ` · ${searchResult.modelKey}` : ""}`, sections: searchResult.mode === "unavailable"
      ? [createMessageSection("semantic-unavailable", { tone: "warning", content: searchResult.message || "向量索引暂不可用" })]
      : [createPageTableSection("semantic-results-table", { rows: searchResult.results, columns: SEARCH_COLUMNS, visibleColumns: SEARCH_COLUMNS.map((column) => column.key), rowKey: (row) => row.chunkUid, emptyText: "未找到相关片段", presentation: { density: "compact", cellWrap: "wrap" } })] }));
    return sections;
  }

  function createSurface(): PageSurfaceCreateSpec | undefined {
    if (view === "overview") return { id: "investment-enterprise-create", presentation: "block", title: "新增投资企业档案", open: Boolean(profileCreate), canCreate, disabled: saving || !(data?.companyCandidates.length), content: { kind: "sections", sections: [{ key: "create-profile", items: profileFields({ draft: profileCreate ?? emptyProfileDraft(), onChange: updateProfileCreate, candidates: data?.companyCandidates, creating: true }), layout: { columns: 2 } }] }, submission: { action: "save", disabled: saving || !profileCreate?.companyId || !profileCreate.portfolioCode, execute: saveProfileCreate }, feedback: { saved: "投资企业档案已新增", error: "新增投资企业档案失败" }, onOpenChange: (open) => setProfileCreate(open ? emptyProfileDraft() : null), onCancel: () => setProfileCreate(null) };
    const kind = viewKind(view); if (!kind || !selected) return undefined;
    const draft = recordCreate ?? emptyRecordDraft(kind, selected.id);
    return { id: `${kind}-create`, presentation: "block", title: `新增${recordTitle(kind)}`, open: Boolean(recordCreate), canCreate, disabled: saving, content: { kind: "sections", sections: [{ key: `${kind}-create-fields`, items: recordFields(kind, draft, updateRecordCreate), layout: { columns: 2 } }] }, submission: { action: "save", disabled: saving || !recordValid(kind, recordCreate), execute: saveRecordCreate }, feedback: { saved: "记录已新增", error: "新增记录失败" }, onOpenChange: (open) => setRecordCreate(open ? emptyRecordDraft(kind, selected.id) : null), onCancel: () => setRecordCreate(null) };
  }

  function recordEditSection(): BodySurfaceSectionSpec {
    if (!recordEdit) throw new Error("编辑记录状态不存在");
    return createAnalysisSection("record-edit", { title: `编辑${recordTitle(recordEdit.kind)}`, sections: [createFieldsSection("record-edit-fields", recordFields(recordEdit.kind, recordEdit.draft, updateRecordEdit), { layout: { columns: 2 }, actions: [
      { key: "cancel", action: "cancel", label: "取消", disabled: saving, onClick: () => setRecordEdit(null) }, { key: "save", action: "save", label: saving ? "保存中..." : "保存", disabled: saving || !recordValid(recordEdit.kind, recordEdit.draft), onClick: () => void saveRecordEdit() },
    ] })] });
  }

  function documentUploadSection(): BodySurfaceSectionSpec {
    return createAnalysisSection("document-upload", { title: "上传并分析资料", sections: [createFieldsSection("document-upload-fields", uploadFields(), { layout: { columns: 1 }, actions: [
      { key: "cancel", action: "cancel", label: "取消", disabled: saving, onClick: closeUpload },
      { key: "save", action: "save", label: saving ? "处理中..." : "上传并分析", disabled: saving || !uploadFile || !uploadTitle.trim(), onClick: () => void uploadDocument() },
    ] })] });
  }

  function uploadFields(): FormSurfaceItemSpec[] {
    return [{ key: "file", label: "资料文件", spec: { valueType: "file", control: "file", state: "required" }, value: uploadFile, onChange: (value) => { const file = value instanceof File ? value : null; setUploadFile(file); if (file && !uploadTitle) setUploadTitle(file.name.replace(/\.[^.]+$/, "")); } },
      { key: "category", label: "资料分类", spec: { valueType: "string", control: "choice", state: "required", options: { source: "static", items: [{ value: "basic", label: "基本资料" }, { value: "governance", label: "股东会/治理" }, { value: "due_diligence", label: "尽调资料" }, { value: "contract", label: "相关合同" }, { value: "monitoring", label: "投后报告" }, { value: "other", label: "其他" }] } }, value: uploadCategory, onChange: (value) => setUploadCategory(String(value ?? "")) },
      { key: "title", label: "资料标题", spec: { valueType: "string", control: "text", state: "required" }, value: uploadTitle, onChange: (value) => setUploadTitle(String(value ?? "")) },
      { key: "notes", label: "分析说明", spec: { valueType: "string", control: "text", state: "normal" }, value: uploadNotes, onChange: (value) => setUploadNotes(String(value ?? "")) }];
  }

  function updateProfile(key: string, value: string | number | null | File) { setProfileEdit((current) => current ? { ...current, [key]: value } : current); }
  function updateProfileCreate(key: string, value: string | number | null | File) { setProfileCreate((current) => current ? { ...current, [key]: value } : current); }
  function updateRecordCreate(key: string, value: string | number | null | File) { setRecordCreate((current) => current ? { ...current, [key]: value } : current); }
  function updateRecordEdit(key: string, value: string | number | null | File) { setRecordEdit((current) => current ? { ...current, draft: { ...current.draft, [key]: value } } : current); }

  async function saveProfile() { if (!profileEdit || !selected) return; setSaving(true); try { await putDirectCommandJson(ENDPOINT, { ...profileEdit, id: selected.id, version: selected.version }, "保存投资企业档案失败"); feedback.success("投资企业档案已保存"); await load(selected.id, deferredKeyword); } catch (cause) { feedback.error(cause instanceof Error ? cause.message : "保存失败"); } finally { setSaving(false); } }
  async function saveProfileCreate() { if (!profileCreate) throw new Error("请填写投资企业档案"); const response = await postDirectCommandJson<{ record: { id: number } }>(ENDPOINT, profileCreate, "新增投资企业档案失败"); setProfileCreate(null); await load(response.record.id, ""); }
  async function saveRecordCreate() { if (!recordCreate) throw new Error("请填写记录"); await postDirectCommandJson(`${ENDPOINT}/records`, recordCreate, "新增记录失败"); setRecordCreate(null); await load(selectedProfileId, deferredKeyword); }
  async function saveRecordEdit() { if (!recordEdit) return; setSaving(true); try { await putDirectCommandJson(`${ENDPOINT}/records`, recordEdit.draft, "保存记录失败"); feedback.success("记录已保存"); setRecordEdit(null); await load(selectedProfileId, deferredKeyword); } catch (cause) { feedback.error(cause instanceof Error ? cause.message : "保存失败"); } finally { setSaving(false); } }
  function openUpload() { setProfileCreate(null); setRecordCreate(null); setRecordEdit(null); setMobileDetailActive(true); setUploadFile(null); setUploadCategory("due_diligence"); setUploadTitle(""); setUploadNotes(""); setUploadOpen(true); }
  function closeUpload() { if (!saving) setUploadOpen(false); }
  async function uploadDocument() { if (!selected || !uploadFile) return; setSaving(true); try { const form = new FormData(); form.set("profileId", String(selected.id)); form.set("documentCategory", uploadCategory); form.set("title", uploadTitle); form.set("notes", uploadNotes); form.set("file", uploadFile); const response = await fetch(workspacePath(`${ENDPOINT}/documents`), { method: "POST", body: form }); const result = await response.json().catch(() => null) as { error?: string } | null; if (!response.ok) throw new Error(result?.error || `上传失败（${response.status}）`); feedback.success("资料已上传，OCR 与向量索引处理完成或已记录待处理状态"); setUploadOpen(false); await load(selected.id, deferredKeyword); } catch (cause) { feedback.error(cause instanceof Error ? cause.message : "上传失败"); } finally { setSaving(false); } }
  async function semanticSearch() { if (!selected || semanticQuery.trim().length < 2) return; setSearching(true); try { const response = await postDirectCommandJson<InvestmentEnterpriseSearchResponse>(`${ENDPOINT}/search`, { profileId: selected.id, query: semanticQuery, limit: 12 }, "语义检索失败"); setSearchResult(response); } catch (cause) { feedback.error(cause instanceof Error ? cause.message : "语义检索失败"); } finally { setSearching(false); } }
}

const SEARCH_COLUMNS: DataSurfaceColumnSpec<InvestmentEnterpriseSearchResponse["results"][number]>[] = [
  { key: "title", label: "资料", required: true, cell: (row) => ({ kind: "text", value: row.title, emphasis: "strong" }) },
  { key: "score", label: "相似度", numeric: true, cell: (row) => `${(row.score * 100).toFixed(1)}%` },
  { key: "quote", label: "原文片段", width: "wide", wrap: "wrap", cell: (row) => row.quote },
  { key: "locator", label: "定位", cell: (row) => formatLocator(row.locator) },
];
function formatLocator(locator: Record<string, unknown>) { return [locator.page ? `第 ${locator.page} 页` : null, locator.sheet ? `工作表 ${locator.sheet}` : null, locator.section ? String(locator.section) : null].filter(Boolean).join(" · ") || "片段定位"; }
function statusLabel(status: string) { return ({ pipeline: "储备", active: "在投", watch: "重点关注", exiting: "退出中", exited: "已退出" } as Record<string, string>)[status] ?? status; }
function viewKind(view: View): InvestmentEnterpriseRecordKind | null { return view === "meetings" ? "meeting" : view === "diligence" ? "diligence" : view === "contracts" ? "contract" : view === "monitoring" ? "monitoring" : null; }
function recordTitle(kind: InvestmentEnterpriseRecordKind) { return kind === "meeting" ? "股东会/治理事项" : kind === "diligence" ? "尽调问题" : kind === "contract" ? "相关合同" : "投后经营快照"; }
function recordValid(kind: InvestmentEnterpriseRecordKind, draft: InvestmentDraft | null) { if (!draft) return false; return kind === "monitoring" ? Boolean(draft.periodEnd) : Boolean(draft.title); }
