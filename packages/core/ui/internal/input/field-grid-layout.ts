export const FIELD_GRID_LABEL_MIN_REM = 5;
export const FIELD_GRID_CONTROL_MIN_REM = 8;
export const FIELD_GRID_LABEL_VALUE_GAP_REM = 0.5;

export interface FieldGridInlineMetricsInput {
  cellWidthPx: number;
  naturalLabelWidthsPx: number[];
  rootFontSizePx: number;
}

/**
 * Resolves the one shared inline label track for a FieldGrid section.
 *
 * Labels grow together from the Core minimum. The shared track stops growing
 * before the value track would fall below its own minimum; individual labels
 * beyond that point are visually truncated by the renderer.
 */
export function resolveFieldGridInlineLabelWidth({
  cellWidthPx,
  naturalLabelWidthsPx,
  rootFontSizePx,
}: FieldGridInlineMetricsInput) {
  const labelMinPx = FIELD_GRID_LABEL_MIN_REM * rootFontSizePx;
  const controlMinPx = FIELD_GRID_CONTROL_MIN_REM * rootFontSizePx;
  const gapPx = FIELD_GRID_LABEL_VALUE_GAP_REM * rootFontSizePx;
  const naturalWidthPx = Math.max(labelMinPx, ...naturalLabelWidthsPx);
  const availableLabelWidthPx = Math.max(labelMinPx, cellWidthPx - controlMinPx - gapPx);
  return Math.min(naturalWidthPx, availableLabelWidthPx);
}

export function resolveFieldGridStackLabelHeight(naturalLabelHeightsPx: number[]) {
  return Math.max(0, ...naturalLabelHeightsPx);
}
