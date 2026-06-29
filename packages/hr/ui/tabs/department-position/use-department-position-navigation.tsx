import { useEffect, useState } from "react";
import type {
  ArchivedEntityTab,
  CreatePositionDraft,
  DescriptionDraft,
  DepartmentPositionMode,
  Selection,
} from "./types";

function createEmptyPositionDescriptionDraft(): DescriptionDraft {
  return {
    id: 0,
    code: "",
    name: "",
    departmentName: "",
    reportTo: "",
    positionPurpose: "",
    summary: "",
    headcount: "1",
    version: "",
    effectiveDate: "",
    sourceFile: "",
    details: "{}",
  };
}

export function useDepartmentPositionNavigation({ mode }: { mode: DepartmentPositionMode }) {
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [treeOpen, setTreeOpen] = useState(true);
  const [treeDrawerOpen, setTreeDrawerOpen] = useState(false);
  const [createPanel, setCreatePanel] = useState<"department" | "position" | null>(null);
  const [createPositionDraft, setCreatePositionDraft] = useState<CreatePositionDraft>({ departmentId: null, name: "" });
  const [createPositionDescriptionDraft, setCreatePositionDescriptionDraft] = useState<DescriptionDraft>(() => createEmptyPositionDescriptionDraft());
  const [collapsedDepartments, setCollapsedDepartments] = useState<Set<number>>(() => new Set());
  const [activeOrganizationRootId, setActiveOrganizationRootId] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedTab, setArchivedTab] = useState<ArchivedEntityTab>("departments");

  useEffect(() => {
    setCreatePanel(null);
    if (mode === "organization") setShowArchived(false);
  }, [mode]);

  function selectItem(nextSelection: Selection) {
    setSelection(nextSelection);
    setTreeDrawerOpen(false);
  }

  return {
    activeOrganizationRootId,
    archivedTab,
    collapsedDepartments,
    createPanel,
    createPositionDescriptionDraft,
    createPositionDraft,
    search,
    selectItem,
    selection,
    setArchivedTab,
    setActiveOrganizationRootId,
    setCollapsedDepartments,
    setCreatePanel,
    setCreatePositionDescriptionDraft,
    setCreatePositionDraft,
    setSearch,
    setSelection,
    setShowArchived,
    setTreeDrawerOpen,
    setTreeOpen,
    showArchived,
    treeDrawerOpen,
    treeOpen,
  };
}
