import { requestJson } from "@workspace/platform/ui/api-client";
import type {
  CreatePositionDraft,
  Department,
  DepartmentDescriptionDraft,
  DepartmentDraft,
  DescriptionDraft,
  Position,
  PositionDraft,
  Selection,
} from "./types";
import { composePositionCode, positionCodeSuffix, serializeAlias } from "./utils";
import {
  departmentDescriptionPayload,
  descriptionPayload,
  draftPayload,
  isPositiveIntegerText,
  sanitizeDepartmentDescriptionDetails,
} from "./draft-utils";

type ToastSetter = (toast: { message: string; type: "success" | "error" } | null) => void;
type ActionPrompt = (title: string, message: string, danger: boolean) => Promise<void>;
type CreateResponse = { record?: { id?: number } };

export function useDepartmentPositionActions({
  createPositionCode,
  createPositionDescriptionDraft,
  createPositionDraft,
  departmentById,
  departmentDescriptionDirty,
  departmentDescriptionDrafts,
  departmentDirty,
  departmentDraft,
  descriptionDirty,
  descriptionDraft,
  draft,
  loadData,
  positionDirty,
  positions,
  selectedDepartment,
  selectedPosition,
  setCreatePanel,
  setCreatePositionDescriptionDraft,
  setCreatePositionDraft,
  setSaving,
  setSelection,
  setToast,
  showActionPrompt,
}: {
  createPositionCode: string;
  createPositionDescriptionDraft: DescriptionDraft;
  createPositionDraft: CreatePositionDraft;
  departmentById: Map<number, Department>;
  departmentDescriptionDirty: boolean;
  departmentDescriptionDrafts: DepartmentDescriptionDraft[];
  departmentDirty: boolean;
  departmentDraft: DepartmentDraft | null;
  descriptionDirty: boolean;
  descriptionDraft: DescriptionDraft | null;
  draft: PositionDraft | null;
  loadData: () => Promise<void>;
  positionDirty: boolean;
  positions: Position[];
  selectedDepartment: Department | undefined;
  selectedPosition: Position | undefined;
  setCreatePanel: (panel: "position" | null) => void;
  setCreatePositionDescriptionDraft: (draft: DescriptionDraft) => void;
  setCreatePositionDraft: (draft: CreatePositionDraft) => void;
  setSaving: (saving: boolean) => void;
  setSelection: (selection: Selection) => void;
  setToast: ToastSetter;
  showActionPrompt: ActionPrompt;
}) {
  const dirty = positionDirty || descriptionDirty;

  async function savePosition() {
    if (!dirty) return;
    if (draft && (!draft.code.trim() || !draft.name.trim())) return setToast({ type: "error", message: "岗位编码和名称不能为空" });
    if (draft?.departmentId) {
      const department = departmentById.get(draft.departmentId);
      const suffix = positionCodeSuffix(draft.code);
      if (!department || !/^\d{2}$/.test(suffix) || draft.code !== composePositionCode(department, suffix, draft.code)) {
        setToast({ type: "error", message: "岗位编码必须由直属组织编码和两位序号组成" });
        return;
      }
    }
    if (draft && positions.some((position) => position.id !== draft.id && position.code === draft.code.trim())) {
      setToast({ type: "error", message: `岗位编码 ${draft.code.trim()} 已存在` });
      return;
    }
    if (draft?.changeKind === "correct" && !draft.changeReason.trim()) return setToast({ type: "error", message: "历史纠错必须填写原因" });
    if (descriptionDraft && !isPositiveIntegerText(descriptionDraft.headcount)) return setToast({ type: "error", message: "编制必须是正整数" });
    if (descriptionDraft?.details.trim() && !isJson(descriptionDraft.details)) return setToast({ type: "error", message: "说明书明细 JSON 不是合法格式" });
    await withSaving(setSaving, setToast, async () => {
      const shouldCreateDescription = Boolean(selectedPosition && !selectedPosition.positionDescriptionId && descriptionDraft && descriptionDirty);
      if (draft && (positionDirty || shouldCreateDescription)) {
        await requestJson("/api/modules/hr/roster/positions", {
          method: "PUT",
          headers: {
            "Idempotency-Key": crypto.randomUUID(),
            "If-Match": String(selectedPosition?.version ?? 0),
          },
          body: JSON.stringify({
            ...draftPayload(draft),
            lifecycle: {
              ...draftPayload(draft).lifecycle,
              targetVersionId: draft.changeKind === "correct" ? selectedPosition?.temporal.current?.id ?? null : null,
            },
            ...(shouldCreateDescription && descriptionDraft ? {
              positionDescription: descriptionPayload(descriptionDraft),
            } : {}),
          }),
          fallbackMessage: "保存岗位失败",
        });
      }
      if (descriptionDraft && descriptionDirty && selectedPosition?.positionDescriptionId) {
        await requestJson("/api/modules/hr/roster/position-descriptions", {
          method: "PUT",
          body: JSON.stringify(descriptionPayload(descriptionDraft)),
          headers: {
            "Idempotency-Key": crypto.randomUUID(),
            "If-Match": String(descriptionDraft.sequence),
          },
          fallbackMessage: "保存岗位说明书失败",
        });
      }
      setToast({ type: "success", message: "岗位资料已保存" });
      await loadData();
    }, "保存失败");
  }

  async function createPosition(positionDescription?: DescriptionDraft) {
    const name = createPositionDraft.name.trim();
    if (!createPositionDraft.departmentId) return setToast({ type: "error", message: "请选择所属组织" });
    if (!name) return setToast({ type: "error", message: "岗位名不能为空" });
    if (!createPositionCode) return setToast({ type: "error", message: "无法生成岗位编码，请检查所属组织" });
    if (positionDescription && !isPositiveIntegerText(positionDescription.headcount)) return setToast({ type: "error", message: "编制必须是正整数" });
    if (positionDescription?.details.trim() && !isJson(positionDescription.details)) return setToast({ type: "error", message: "说明书明细 JSON 不是合法格式" });
    await withSaving(setSaving, setToast, async () => {
      const data = await requestJson<CreateResponse>("/api/modules/hr/roster/positions", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          code: createPositionCode,
          name,
          departmentId: createPositionDraft.departmentId,
          reportToPositionId: createPositionDraft.reportToPositionId,
          positionDescription: positionDescription ? descriptionPayload(positionDescription) : undefined,
          lifecycle: { kind: "schedule" },
        }),
        fallbackMessage: "新建岗位失败",
      });
      setCreatePositionDraft({ departmentId: createPositionDraft.departmentId, name: "", reportTo: "", reportToPositionId: null });
      setCreatePositionDescriptionDraft({ ...createPositionDescriptionDraft, positionPurpose: "", summary: "", headcount: "1", version: "", effectiveDate: "", sourceFile: "", details: "{}", changeKind: "change", changeReason: "" });
      setCreatePanel(null);
      await loadData();
      if (typeof data.record?.id === "number") setSelection({ type: "position", id: data.record.id });
      setToast({ type: "success", message: "岗位已新建" });
    }, "新建岗位失败");
  }

  async function saveDepartmentInfo() {
    if (!selectedDepartment || !departmentDraft || (!departmentDirty && !departmentDescriptionDirty)) return;
    const departmentName = departmentDraft.name.trim();
    if (!departmentName) return setToast({ type: "error", message: "组织名称不能为空" });
    if (departmentDraft.changeKind === "correct" && !departmentDraft.changeReason.trim()) return setToast({ type: "error", message: "历史纠错必须填写原因" });
    await withSaving(setSaving, setToast, async () => {
      const outcome = await requestJson<{ executionMode: "direct" | "workflow" }>("/api/modules/hr/roster/departments", {
        method: "PUT",
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
          "If-Match": String(selectedDepartment.version),
        },
        body: JSON.stringify({
          id: selectedDepartment.id,
          code: departmentDraft.code.trim(),
          name: departmentName,
          alias: serializeAlias(departmentDraft.alias || ""),
          hierarchyKind: departmentDraft.hierarchyKind,
          level: departmentDraft.level,
          parentId: departmentDraft.parentId,
          managerPositionId: departmentDraft.managerPositionId,
          lifecycle: {
            kind: departmentDraft.changeKind,
            effectiveOn: departmentDraft.effectiveOn,
            reason: departmentDraft.changeReason.trim() || null,
            targetVersionId: departmentDraft.changeKind === "correct" ? selectedDepartment.temporal.current?.id ?? null : null,
          },
          descriptions: departmentDescriptionDrafts.slice(0, 1).map((draft) => departmentDescriptionPayload({
            ...draft,
            details: sanitizeDepartmentDescriptionDetails(draft.details, departmentName),
          })),
        }),
        fallbackMessage: "保存组织信息失败",
      });
      setToast({ type: "success", message: outcome.executionMode === "workflow" ? "组织流程已提交" : "组织信息已保存" });
      await loadData();
    }, "保存失败");
  }

  async function setDepartmentArchived(departmentId: number, archived: boolean) {
    const department = departmentById.get(departmentId);
    await setArchived("/api/modules/hr/roster/departments", departmentId, archived, "组织", department?.version ?? 0, department?.asOfDate, loadData, setSaving, showActionPrompt);
  }

  async function setPositionArchived(positionId: number, archived: boolean) {
    const position = positions.find((item) => item.id === positionId);
    await setArchived("/api/modules/hr/roster/positions", positionId, archived, "岗位", position?.version ?? 0, position?.asOfDate, loadData, setSaving, showActionPrompt);
  }

  return { createPosition, saveDepartmentInfo, savePosition, setDepartmentArchived, setPositionArchived };
}

function isJson(value: string) {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

async function withSaving(setSaving: (saving: boolean) => void, setToast: ToastSetter, run: () => Promise<void>, fallbackMessage: string) {
  setSaving(true);
  try {
    await run();
  } catch (err) {
    setToast({ type: "error", message: err instanceof Error ? err.message : fallbackMessage });
  } finally {
    setSaving(false);
  }
}

async function setArchived(
  path: string,
  id: number,
  archived: boolean,
  label: "组织" | "岗位",
  version: number,
  effectiveOn: string | undefined,
  loadData: () => Promise<void>,
  setSaving: (saving: boolean) => void,
  showActionPrompt: ActionPrompt,
) {
  setSaving(true);
  try {
    await requestJson(`${path}/${id}/archive`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID(), "If-Match": String(version) },
      body: JSON.stringify({ archived, effectiveOn, reason: archived ? `归档${label}` : null }),
      fallbackMessage: "操作失败",
    });
    await loadData();
    await showActionPrompt(archived ? "归档成功" : "恢复成功", archived ? `${label}已归档` : `${label}已恢复`, false);
  } catch (err) {
    await showActionPrompt(archived ? "无法归档" : "无法恢复", err instanceof Error ? err.message : "操作失败", true);
  } finally {
    setSaving(false);
  }
}
