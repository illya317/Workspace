"use client";

import { ActionButton } from "../action/ActionControls";
import {
  ACTION_GLYPH_ACTION_BY_KEY,
  ACTION_GLYPH_ORDER_BY_KIND,
} from "../action/ActionGlyphs";
import type { InputSurfaceProps } from "../../InputSurface";
import type { FormSurfaceActionSpec } from "../../FormSurface.types";

function actionOrder(action: FormSurfaceActionSpec) {
  const definition = ACTION_GLYPH_ACTION_BY_KEY[action.action];
  return ACTION_GLYPH_ORDER_BY_KIND[definition.icon].order;
}

export function orderFormSurfaceActions(actions: readonly FormSurfaceActionSpec[]) {
  return [...actions].sort((left, right) => actionOrder(left) - actionOrder(right));
}

export function renderFormSurfaceActions(
  actions: FormSurfaceActionSpec[] | undefined,
  density: InputSurfaceProps["density"],
) {
  if (!actions?.length) return null;
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {orderFormSurfaceActions(actions).map((action) => {
        const definition = ACTION_GLYPH_ACTION_BY_KEY[action.action];
        const label = action.label ?? definition.label;
        const submitsForm = action.action === "submit" || (action.action === "save" && !action.onClick);
        return (
          <ActionButton
            key={action.key}
            kind={definition.icon}
            label={label}
            type={submitsForm ? "submit" : "button"}
            variant={definition.variant}
            disabled={action.disabled}
            size={density === "compact" ? "sm" : "md"}
            onClick={action.onClick}
          />
        );
      })}
    </div>
  );
}
