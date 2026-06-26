import { useEffect, useState } from "react";
import type {
  ArchivedEntityTab,
  CreatePositionDraft,
  DepartmentPositionMode,
  Selection,
} from "./types";

export function useDepartmentPositionNavigation({ mode }: { mode: DepartmentPositionMode }) {
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [treeOpen, setTreeOpen] = useState(true);
  const [treeDrawerOpen, setTreeDrawerOpen] = useState(false);
  const [createPanel, setCreatePanel] = useState<"department" | "position" | null>(null);
  const [createPositionDraft, setCreatePositionDraft] = useState<CreatePositionDraft>({ departmentId: null, name: "" });
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
    createPositionDraft,
    search,
    selectItem,
    selection,
    setArchivedTab,
    setActiveOrganizationRootId,
    setCollapsedDepartments,
    setCreatePanel,
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
