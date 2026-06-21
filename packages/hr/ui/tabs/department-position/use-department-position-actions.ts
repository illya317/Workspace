import { postJson, putJson } from "@workspace/platform/ui/api-client";
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
  departmentManagerPositionName,
  descriptionPayload,
  draftPayload,
  isPositiveIntegerText,
  sanitizeDepartmentDescriptionDetails,
} from "./draft-utils";

type ToastSetter = (toast: { message: string; type: "success" | "error" } | null) => void;
type CreateResponse = { record?: { id?: number } };

export function useDepartmentPositionActions({
  createPositionCode,
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
  setCreatePositionDraft,
  setSaving,
  setSelection,
  setToast,
}: {
  createPositionCode: string;
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
  setCreatePositionDraft: (draft: CreatePositionDraft) => void;
  setSaving: (saving: boolean) => void;
  setSelection: (selection: Selection) => void;
  setToast: ToastSetter;
}) {
  const dirty = positionDirty || descriptionDirty;

  async function savePosition() {
    if (!dirty) return;
    if (draft && (!draft.code.trim() || !draft.name.trim())) return setToast({ type: "error", message: "岗位编码和名称不能为空" });
    if (draft?.departmentId) {
      const department = departmentById.get(draft.departmentId);
      const suffix = positionCodeSuffix(draft.code);
      if (!department || !/^\d{2}$/.test(suffix) || draft.code !== composePositionCode(department, suffix, draft.code)) {
        setToast({ type: "error", message: "岗位编码必须由直属部门编码和两位序号组成" });
        return;
      }
    }
    if (draft && positions.some((position) => position.id !== draft.id && position.code === draft.code.trim())) {
      setToast({ type: "error", message: `岗位编码 ${draft.code.trim()} 已存在` });
      return;
    }
    if (descriptionDraft && (!descriptionDraft.code.trim() || !descriptionDraft.name.trim())) return setToast({ type: "error", message: "说明书编码和名称不能为空" });
    if (descriptionDraft && !isPositiveIntegerText(descriptionDraft.headcount)) return setToast({ type: "error", message: "编制必须是正整数" });
    if (descriptionDraft?.details.trim() && !isJson(descriptionDraft.details)) return setToast({ type: "error", message: "说明书明细 JSON 不是合法格式" });
    await withSaving(setSaving, setToast, async () => {
      if (draft && positionDirty) await putJson("/api/modules/hr/roster/positions", draftPayload(draft), "保存岗位失败");
      if (descriptionDraft && descriptionDirty && selectedPosition) {
        await putJson("/api/modules/hr/roster/position-descriptions", {
          ...descriptionPayload(descriptionDraft),
          name: selectedPosition.name,
          departmentName: selectedPosition.departmentName || null,
        }, "保存岗位说明书失败");
      }
      setToast({ type: "success", message: "岗位资料已保存" });
      await loadData();
    }, "保存失败");
  }

  async function createPosition() {
    const name = createPositionDraft.name.trim();
    if (!createPositionDraft.departmentId) return setToast({ type: "error", message: "请选择所属部门" });
    if (!name) return setToast({ type: "error", message: "岗位名不能为空" });
    if (!createPositionCode) return setToast({ type: "error", message: "无法生成岗位编码，请检查所属部门" });
    await withSaving(setSaving, setToast, async () => {
      const data = await postJson<CreateResponse>("/api/modules/hr/roster/positions", { code: createPositionCode, name, departmentId: createPositionDraft.departmentId }, "新建岗位失败");
      setCreatePositionDraft({ departmentId: createPositionDraft.departmentId, name: "" });
      setCreatePanel(null);
      await loadData();
      if (typeof data.record?.id === "number") setSelection({ type: "position", id: data.record.id });
      setToast({ type: "success", message: "岗位已新建" });
    }, "新建岗位失败");
  }

  async function saveDepartmentInfo() {
    if (!selectedDepartment || !departmentDraft || !departmentDirty) return;
    const departmentName = departmentDraft.name.trim();
    if (!departmentName) return setToast({ type: "error", message: "部门名称不能为空" });
    await withSaving(setSaving, setToast, async () => {
      await putJson("/api/modules/hr/roster/departments", {
        id: selectedDepartment.id,
        name: departmentName,
        alias: serializeAlias(departmentDraft.alias || ""),
        descriptions: departmentDescriptionDrafts.slice(0, 1).map((draft) => departmentDescriptionPayload({
          ...draft,
          name: departmentName,
          details: sanitizeDepartmentDescriptionDetails(draft.details, departmentName, departmentDraft.managerPositionName),
        })),
      }, "保存部门信息失败");
      setToast({ type: "success", message: "部门信息已保存" });
      await loadData();
    }, "保存失败");
  }

  async function saveDepartmentDescription() {
    if (!selectedDepartment || !departmentDescriptionDirty) return;
    if (departmentDescriptionDrafts.some((draft) => !draft.code.trim() || !draft.name.trim())) return setToast({ type: "error", message: "部门说明书编码和名称不能为空" });
    if (departmentDescriptionDrafts.some((draft) => draft.details.trim() && !isJson(draft.details))) return setToast({ type: "error", message: "部门说明书 JSON 不是合法格式" });
    await withSaving(setSaving, setToast, async () => {
      await putJson("/api/modules/hr/roster/departments", {
        id: selectedDepartment.id,
        descriptions: departmentDescriptionDrafts.slice(0, 1).map((draft) => departmentDescriptionPayload({
          ...draft,
          name: selectedDepartment.name,
          details: sanitizeDepartmentDescriptionDetails(draft.details, selectedDepartment.name, departmentDraft?.managerPositionName || departmentManagerPositionName(selectedDepartment)),
        })),
      }, "保存部门说明书失败");
      setToast({ type: "success", message: "部门说明书已保存" });
      await loadData();
    }, "保存失败");
  }

  async function setDepartmentArchived(departmentId: number, archived: boolean) {
    await setArchived("/api/modules/hr/roster/departments", departmentId, archived, "部门", loadData, setSaving, setToast);
  }

  async function setPositionArchived(positionId: number, archived: boolean) {
    await setArchived("/api/modules/hr/roster/positions", positionId, archived, "岗位", loadData, setSaving, setToast);
  }

  return { createPosition, saveDepartmentDescription, saveDepartmentInfo, savePosition, setDepartmentArchived, setPositionArchived };
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
  label: "部门" | "岗位",
  loadData: () => Promise<void>,
  setSaving: (saving: boolean) => void,
  setToast: ToastSetter,
) {
  await withSaving(setSaving, setToast, async () => {
    await putJson(path, { id, isArchived: archived }, "操作失败");
    setToast({ type: "success", message: archived ? `${label}已归档` : `${label}已恢复` });
    await loadData();
  }, "操作失败");
}
