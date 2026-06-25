"use client";

import type { FC } from "react";
import {
  AmountCell,
  NumberCell,
} from "@workspace/core/ui";

function AmountCellPreview() {
  return (
<AmountCell value={12800.5} />
  );
}

function NumberCellPreview() {
  return (
<NumberCell value={1280} />
  );
}

export const cellPreviewByName: Record<string, FC> = {
  AmountCell: AmountCellPreview,
  NumberCell: NumberCellPreview,
};
