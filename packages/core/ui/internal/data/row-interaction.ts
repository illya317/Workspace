import type { KeyboardEvent, MouseEvent } from "react";

const NESTED_INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "details",
  "[role='button']",
  "[role='link']",
  "[contenteditable='true']",
  "[data-row-interaction-stop]",
].join(",");

export function hasNestedInteractiveRowTarget(interactiveTarget: Element | null, row: Element) {
  return interactiveTarget !== null && interactiveTarget !== row;
}

function isNestedInteractiveTarget(target: EventTarget | null, row: Element) {
  if (!(target instanceof Element) || target === row) return false;
  return hasNestedInteractiveRowTarget(target.closest(NESTED_INTERACTIVE_SELECTOR), row);
}

export function activateDataSurfaceRowFromClick<T>(
  event: MouseEvent<HTMLElement>,
  row: T,
  onRowClick: (row: T) => void,
) {
  if (isNestedInteractiveTarget(event.target, event.currentTarget)) return;
  onRowClick(row);
}

export function activateDataSurfaceRowFromKeyboard<T>(
  event: KeyboardEvent<HTMLElement>,
  row: T,
  onRowClick: (row: T) => void,
) {
  if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  onRowClick(row);
}
