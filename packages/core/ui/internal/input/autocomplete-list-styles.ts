export const AUTOCOMPLETE_LIST_CLASS_NAME =
  "absolute left-0 top-[calc(100%+0.35rem)] z-50 w-full rounded-lg border border-slate-200 bg-white p-2 shadow-xl";

export const AUTOCOMPLETE_INLINE_LIST_CLASS_NAME =
  "mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2";

export const AUTOCOMPLETE_LIST_BODY_CLASS_NAME = "max-h-80 overflow-auto";

export function getAutocompleteOptionClassName({
  active = false,
  selected = false,
}: {
  active?: boolean;
  selected?: boolean;
}) {
  if (active || selected) {
    return "flex w-full min-w-0 items-center gap-3 rounded-md bg-emerald-50 px-3 py-2 text-left text-sm text-emerald-800 transition";
  }
  return "flex w-full min-w-0 items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-slate-800 transition hover:bg-slate-50";
}

export const AUTOCOMPLETE_EMPTY_CLASS_NAME =
  "rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400";
