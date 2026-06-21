"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import InlineFeedbackEditor from "./InlineFeedbackEditor";
import InlineFeedbackMarkerButton from "./InlineFeedbackMarkerButton";
import {
  anchorId,
  editorStyle,
  entriesForAnchor,
  findAnchorElement,
  HIDE_DELAY_MS,
  inlineEntriesFromItems,
  markersFromEntries,
  markerStyle,
  readAnchor,
  type FeedbackResponse,
  type InlineAnchor,
  type InlineEntry,
} from "./inline-feedback-utils";
import { feedbackContext, feedbackKey, type WorkbenchSelection } from "./types";

interface Props { selection: WorkbenchSelection; children: ReactNode; onSaved?: (keys: string[]) => void }

export default function TemplateInlineFeedback({ selection, children, onSaved }: Props) {
  const context = useMemo(() => feedbackContext(selection), [selection]);
  const contextKey = useMemo(() => feedbackKey(context), [context]);
  const hoverTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const pendingAnchorIdRef = useRef("");
  const popoverHoveredRef = useRef(false);
  const editorOpenRef = useRef(false);
  const [anchor, setAnchor] = useState<InlineAnchor | null>(null);
  const [savedEntries, setSavedEntries] = useState<InlineEntry[]>([]);
  const [anchorEntries, setAnchorEntries] = useState<InlineEntry[]>([]);
  const [savedMarkers, setSavedMarkers] = useState<InlineAnchor[]>([]);
  const [popoverHovered, setPopoverHovered] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function clearHoverTimer() { if (hoverTimerRef.current != null) window.clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; pendingAnchorIdRef.current = ""; }
  function clearHideTimer() { if (hideTimerRef.current != null) window.clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }

  function queueHide() {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      if (!popoverHoveredRef.current && !editorOpenRef.current) setAnchor(null);
    }, HIDE_DELAY_MS);
  }

  const refreshInlineEntries = useCallback(async () => {
    try {
      const response = await fetch(workspacePath(`/api/modules/production/qc-templates/feedback?key=${encodeURIComponent(contextKey)}`));
      const body = await response.json() as FeedbackResponse;
      const allEntries = inlineEntriesFromItems(body.items);
      const currentUserEntries = body.data?.inlineEntries || [];
      setSavedEntries(allEntries);
      return { allEntries, currentUserEntries };
    } catch {
      setSavedEntries([]);
      return { allEntries: [], currentUserEntries: [] };
    }
  }, [contextKey]);

  function syncSavedMarkers(entries: InlineEntry[]) {
    setSavedMarkers(markersFromEntries(entries));
  }

  function isSavedAnchor(candidate: Omit<InlineAnchor, "rect"> | null) {
    return !!candidate && savedEntries.some((entry) => entry.id === anchorId(candidate));
  }

  function isSavedMarkerVisible(candidate: Omit<InlineAnchor, "rect"> | null) {
    return !!candidate && savedMarkers.some((marker) => anchorId(marker) === anchorId(candidate));
  }

  useEffect(() => {
    setAnchor(null); setEditorOpen(false); setNote(""); setError(""); setAnchorEntries([]);
    setSavedEntries([]); setSavedMarkers([]);
    clearHoverTimer(); clearHideTimer();
  }, [contextKey]);

  useEffect(() => () => { clearHoverTimer(); clearHideTimer(); }, []);

  useEffect(() => {
    void refreshInlineEntries();
  }, [contextKey, refreshInlineEntries]);

  useEffect(() => {
    syncSavedMarkers(savedEntries);
    const raf = window.requestAnimationFrame(() => syncSavedMarkers(savedEntries));
    const timeout = window.setTimeout(() => syncSavedMarkers(savedEntries), 150);
    const refresh = () => syncSavedMarkers(savedEntries);
    window.addEventListener("scroll", refresh, true);
    window.addEventListener("resize", refresh);
    return () => {
      window.cancelAnimationFrame(raf); window.clearTimeout(timeout);
      window.removeEventListener("scroll", refresh, true); window.removeEventListener("resize", refresh);
    };
  }, [savedEntries]);

  useEffect(() => {
    popoverHoveredRef.current = popoverHovered; editorOpenRef.current = editorOpen;
  }, [popoverHovered, editorOpen]);

  useEffect(() => {
    if (!anchor) return;
    const refresh = () => {
      const active = findAnchorElement(anchor);
      if (active) setAnchor((current) => current ? { ...current, rect: active.rect } : current);
    };
    window.addEventListener("scroll", refresh, true);
    window.addEventListener("resize", refresh);
    return () => {
      window.removeEventListener("scroll", refresh, true); window.removeEventListener("resize", refresh);
    };
  }, [anchor]);

  async function openEditor(nextAnchor: InlineAnchor) {
    setEditorOpen(true);
    setError("");
    setLoading(true);
    try {
      const entries = await refreshInlineEntries();
      setAnchorEntries(entriesForAnchor(entries.allEntries, nextAnchor));
      setNote(entries.currentUserEntries.find((entry) => entry.id === anchorId(nextAnchor))?.note || "");
      setAnchor(nextAnchor);
    } catch {
      setError("读取反馈失败");
      setNote("");
    } finally {
      setLoading(false);
    }
  }

  async function saveInlineFeedback() {
    if (!anchor) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(workspacePath("/api/modules/production/qc-templates/feedback"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, inlineEntry: { target: anchorToTarget(anchor), note } }),
      });
      const body = await response.json() as FeedbackResponse;
      if (!response.ok) throw new Error(body.error || "保存失败");
      await refreshInlineEntries();
      onSaved?.(body.keys || []);
      setEditorOpen(false);
      setAnchor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function handleMouseMove(event: ReactMouseEvent<HTMLDivElement>) {
    if (editorOpen) return;
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-inline-feedback='true']") ?? null;
    const nextAnchor = readAnchor(target);
    if (!nextAnchor) {
      clearHoverTimer();
      if (!popoverHovered) queueHide();
      return;
    }
    clearHideTimer();
    if (anchor && anchorId(anchor) === anchorId(nextAnchor)) {
      setAnchor({ ...nextAnchor });
      return;
    }
    const nextAnchorId = anchorId(nextAnchor);
    if (pendingAnchorIdRef.current === nextAnchorId) return;
    clearHoverTimer();
    pendingAnchorIdRef.current = nextAnchorId;
    hoverTimerRef.current = window.setTimeout(() => {
      setAnchor(nextAnchor); pendingAnchorIdRef.current = ""; hoverTimerRef.current = null;
    }, 500);
  }

  return (
    <div className="relative" onMouseMove={handleMouseMove} onMouseLeave={() => { clearHoverTimer(); if (!popoverHovered && !editorOpen) queueHide(); }}>
      {children}
      {savedMarkers.map((marker) => <Marker key={`saved-${anchorId(marker)}`} anchor={marker} tone="saved" onClick={() => openEditor(marker)} />)}
      {anchor && !editorOpen && (!isSavedAnchor(anchor) || !isSavedMarkerVisible(anchor)) ? (
        <div className="fixed z-40 p-2" style={markerStyle(anchor.rect)} onMouseEnter={() => { clearHideTimer(); setPopoverHovered(true); }} onMouseLeave={() => { setPopoverHovered(false); queueHide(); }}>
          <InlineFeedbackMarkerButton tone={isSavedAnchor(anchor) ? "saved" : "hover"} onClick={() => openEditor(anchor)} />
        </div>
      ) : null}
      {anchor && editorOpen ? (
        <InlineFeedbackEditor
          anchor={anchor}
          selection={selection}
          entries={anchorEntries}
          note={note}
          loading={loading}
          saving={saving}
          error={error}
          style={editorStyle(anchor.rect)}
          onNoteChange={setNote}
          onSave={saveInlineFeedback}
          onClose={() => { setEditorOpen(false); queueHide(); }}
          onHoverChange={setPopoverHovered}
        />
      ) : null}
    </div>
  );
}

function Marker({ anchor, tone, onClick }: { anchor: InlineAnchor; tone: "saved" | "hover"; onClick: () => void }) {
  return <div className="fixed z-30 p-2" style={markerStyle(anchor.rect)}><InlineFeedbackMarkerButton tone={tone} onClick={onClick} /></div>;
}

function anchorToTarget(anchor: InlineAnchor) {
  return { kind: anchor.kind, key: anchor.key, label: anchor.label, section: anchor.section, badgeKind: anchor.badgeKind };
}
