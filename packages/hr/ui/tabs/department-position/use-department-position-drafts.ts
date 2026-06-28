import { useEffect, useState } from "react";
import type {
  Department,
  DepartmentDescriptionDraft,
  DepartmentDraft,
  DescriptionDraft,
  Position,
  PositionDraft,
} from "./types";
import { composePositionCode, positionCodeSuffix } from "./utils";
import {
  createDepartmentDescriptionDraft,
  createDepartmentDraft,
  createDescriptionDraft,
  createDraft,
  departmentDraftPayload,
  normalizeDepartmentDescriptionSourceForCompare,
  normalizeDepartmentDescriptionsForCompare,
  normalizeDescriptionForCompare,
  normalizeDraftForCompare,
  normalizePositionDescriptionForCompare,
  normalizePositionForCompare,
} from "./draft-utils";

export function useDepartmentPositionDrafts({
  departmentById,
  selectedDepartment,
  selectedPosition,
}: {
  departmentById: Map<number, Department>;
  selectedDepartment: Department | undefined;
  selectedPosition: Position | undefined;
}) {
  const [draft, setDraft] = useState<PositionDraft | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState<DescriptionDraft | null>(null);
  const [departmentDraft, setDepartmentDraft] = useState<DepartmentDraft | null>(null);
  const [departmentDescriptionDrafts, setDepartmentDescriptionDrafts] = useState<DepartmentDescriptionDraft[]>([]);

  useEffect(() => {
    setDraft(selectedPosition ? createDraft(selectedPosition) : null);
    setDescriptionDraft(selectedPosition ? createDescriptionDraft(selectedPosition) : null);
  }, [selectedPosition]);

  useEffect(() => {
    setDepartmentDraft(selectedDepartment ? createDepartmentDraft(selectedDepartment) : null);
    setDepartmentDescriptionDrafts(selectedDepartment
      ? [createDepartmentDescriptionDraft(selectedDepartment, selectedDepartment.descriptions[0])]
      : []);
  }, [selectedDepartment]);

  const draftMatchesSelection = selectedPosition ? draft?.id === selectedPosition.id : draft === null;
  const departmentDraftMatchesSelection = selectedDepartment ? departmentDraft?.id === selectedDepartment.id : departmentDraft === null;
  const effectiveDraft = draftMatchesSelection ? draft : selectedPosition ? createDraft(selectedPosition) : null;
  const effectiveDescriptionDraft = draftMatchesSelection ? descriptionDraft : selectedPosition ? createDescriptionDraft(selectedPosition) : null;
  const effectiveDepartmentDraft = departmentDraftMatchesSelection ? departmentDraft : selectedDepartment ? createDepartmentDraft(selectedDepartment) : null;
  const effectiveDepartmentDescriptionDrafts = departmentDraftMatchesSelection
    ? departmentDescriptionDrafts
    : selectedDepartment
      ? [createDepartmentDescriptionDraft(selectedDepartment, selectedDepartment.descriptions[0])]
      : [];

  const positionDirty = Boolean(effectiveDraft && selectedPosition && normalizeDraftForCompare(effectiveDraft) !== normalizePositionForCompare(selectedPosition));
  const descriptionDirty = Boolean(effectiveDescriptionDraft && selectedPosition && normalizeDescriptionForCompare(effectiveDescriptionDraft) !== normalizePositionDescriptionForCompare(selectedPosition));
  const departmentDirty = Boolean(effectiveDepartmentDraft && selectedDepartment && JSON.stringify(departmentDraftPayload(effectiveDepartmentDraft)) !== JSON.stringify(departmentDraftPayload(createDepartmentDraft(selectedDepartment))));
  const departmentDescriptionDirty = Boolean(selectedDepartment && normalizeDepartmentDescriptionsForCompare(effectiveDepartmentDescriptionDrafts) !== normalizeDepartmentDescriptionSourceForCompare(selectedDepartment));
  const dirty = positionDirty || descriptionDirty;

  function updateDraft<K extends keyof PositionDraft>(key: K, value: PositionDraft[K]) {
    setDraft((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  function updateDraftDepartment(departmentId: number | null) {
    setDraft((prev) => {
      if (!prev) return prev;
      const department = departmentId ? departmentById.get(departmentId) : undefined;
      return {
        ...prev,
        departmentId,
        code: composePositionCode(department, positionCodeSuffix(prev.code), prev.code),
      };
    });
  }

  function updateDraftCodeSuffix(value: string, pad = false) {
    const digits = value.replace(/\D/g, "").slice(0, 2);
    const suffix = pad && digits.length === 1 ? digits.padStart(2, "0") : digits;
    setDraft((prev) => {
      if (!prev) return prev;
      const department = prev.departmentId ? departmentById.get(prev.departmentId) : undefined;
      return { ...prev, code: composePositionCode(department, suffix, prev.code) };
    });
  }

  function updateDescriptionDraft<K extends keyof DescriptionDraft>(key: K, value: DescriptionDraft[K]) {
    setDescriptionDraft((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  function updateDepartmentDescriptionDraft<K extends keyof DepartmentDescriptionDraft>(index: number, key: K, value: DepartmentDescriptionDraft[K]) {
    setDepartmentDescriptionDrafts((prev) => prev.map((draft, draftIndex) => draftIndex === index ? { ...draft, [key]: value } : draft));
  }

  function updateDepartmentDraft<K extends keyof DepartmentDraft>(key: K, value: DepartmentDraft[K]) {
    setDepartmentDraft((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  return {
    departmentDescriptionDirty,
    departmentDescriptionDrafts: effectiveDepartmentDescriptionDrafts,
    departmentDirty,
    departmentDraft: effectiveDepartmentDraft,
    descriptionDirty,
    descriptionDraft: effectiveDescriptionDraft,
    dirty,
    draft: effectiveDraft,
    positionDirty,
    updateDepartmentDescriptionDraft,
    updateDepartmentDraft,
    updateDescriptionDraft,
    updateDraft,
    updateDraftCodeSuffix,
    updateDraftDepartment,
  };
}
