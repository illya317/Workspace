"use client";

import { useEffect, useState } from "react";

export const DOCUMENT_EDITOR_MOBILE_PORTRAIT_QUERY = "(max-width: 639px) and (orientation: portrait)";
export const DOCUMENT_EDITOR_COMPACT_LANDSCAPE_QUERY = "(max-width: 1000px) and (max-height: 500px) and (orientation: landscape)";

export function useDocumentEditorMobileLayout() {
  return {
    portrait: useMediaQuery(DOCUMENT_EDITOR_MOBILE_PORTRAIT_QUERY),
    compactLandscape: useMediaQuery(DOCUMENT_EDITOR_COMPACT_LANDSCAPE_QUERY),
  };
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => (
    typeof window !== "undefined" && window.matchMedia(query).matches
  ));

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, [query]);

  return matches;
}
