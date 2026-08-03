"use client";

import type { CSSProperties, ReactNode } from "react";
import dayjs, { type Dayjs } from "dayjs";
import { matchText } from "../../../search";
import { joinClassNames } from "../common/card-utils";
import type { FieldControlSize } from "../form/FormStyles";
import { toInputSurfaceSearchableOption, type InputOption, type InputSurfaceProps } from "./InputSurfaceTypes";
import { getAutocompleteOptionDisplay } from "./autocomplete-option-display";

export type AntdInputFieldProps = InputSurfaceProps & {
  className?: string;
  style?: CSSProperties;
  onDismiss?: () => void;
};

/** FieldControlSize(sm/md/lg) → antd small/middle/large。 */
export function antdControlSize(size: FieldControlSize = "md"): "small" | "medium" | "large" {
  if (size === "sm") return "small";
  if (size === "lg") return "large";
  return "medium";
}

/** density=compact 无 antd 组件级对应,以 wrapper 上的紧凑样式保持紧凑密度契约。 */
export function antdDensityClass(density: "normal" | "compact" = "normal") {
  return density === "compact"
    ? "[&_.ant-input]:!py-0.5 [&_.ant-input-number-input]:!py-0.5 [&_.ant-select-selector]:!min-h-8"
    : "";
}

/** 所有 antd 输入控件的统一外层标记:data-ui-renderer 标记与 title/data-field-key/className/style 透传。 */
export function AntdInputMarker({
  children,
  className,
  dataFieldKey,
  density,
  style,
  title,
}: {
  children: ReactNode;
  className?: string;
  dataFieldKey?: string;
  density?: "normal" | "compact";
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <span
      className={joinClassNames("inline-flex w-full min-w-0", antdDensityClass(density), className)}
      data-field-key={dataFieldKey}
      data-ui-renderer="antd"
      style={style}
      title={title}
    >
      {children}
    </span>
  );
}

/** legacy CalendarDateInput 的值格式:date=YYYY-MM-DD,month=YYYY-MM;无效值返回 undefined(与 legacy 空显示一致)。 */
export function parseAntdDateValue(value: string, precision: "date" | "month"): Dayjs | undefined {
  const pattern = precision === "month" ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(value)) return undefined;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : undefined;
}

/** legacy TimeField 的值格式:HH:mm。 */
export function parseAntdTimeValue(value: string): Dayjs | undefined {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return undefined;
  return dayjs().hour(hour).minute(minute).second(0).millisecond(0);
}

const TAG_DELIMITER = /[,，、;；\n]+/;

/** 与 legacy TagStringInput.splitTags 一致的分隔/去重规则。 */
export function splitAntdTagString(value: string): string[] {
  return [...new Set(value.split(TAG_DELIMITER).map((item) => item.trim()).filter(Boolean))];
}

/** legacy tags onChange 契约:去重后以「、」连接的字符串。 */
export function joinAntdTagString(items: string[]): string {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].join("、");
}

/** 与 legacy TagStringInput 的分隔键一致,粘贴/键入时按相同分隔符拆标签。 */
export const ANTD_TAG_TOKEN_SEPARATORS = [",", "，", "、", ";", "；"];

export type AntdChoiceOption = {
  value: string;
  label: string;
  disabled?: boolean;
  subtitle?: string;
  searchText?: string;
  hoverText?: string;
};

/** InputOption → antd 选项,保留 disabled/subtitle/searchText 与 legacy hover 文本。 */
export function toAntdChoiceOption(option: InputOption): AntdChoiceOption {
  const searchable = toInputSurfaceSearchableOption(option);
  const label = searchable.label ?? searchable.value;
  return {
    value: searchable.value,
    label,
    disabled: searchable.disabled,
    subtitle: searchable.subtitle,
    searchText: searchable.searchText,
    hoverText: getAutocompleteOptionDisplay(label, searchable.subtitle).hoverText,
  };
}

function antdChoiceDefaultVisibleCount(count: number) {
  return count > 0 && count < 10 ? count : 5;
}

/** 与 legacy SearchableOptionInput 相同的命中规则:label/value 直接命中优先,其次 searchText 模糊命中,按 visibleCount 截断。 */
export function filterAntdChoiceOptions(
  options: AntdChoiceOption[],
  query: string,
  visibleCount?: number,
): AntdChoiceOption[] {
  const limit = visibleCount ?? antdChoiceDefaultVisibleCount(options.length);
  const keyword = query.trim();
  if (!keyword) return options.slice(0, limit);
  const directHits: AntdChoiceOption[] = [];
  const fuzzyHits: AntdChoiceOption[] = [];
  for (const option of options) {
    const haystack = `${option.value} ${option.label} ${option.searchText ?? ""}`;
    if (matchText(option.label, keyword) || matchText(option.value, keyword)) directHits.push(option);
    else if (matchText(haystack, keyword)) fuzzyHits.push(option);
    if (directHits.length + fuzzyHits.length >= limit) break;
  }
  return [...directHits, ...fuzzyHits].slice(0, limit);
}

/** grouped 选项的 antd 过滤谓词:与 legacy 相同的 matchText 命中 label/value/searchText。 */
export function matchAntdChoiceOption(input: string, option: AntdChoiceOption): boolean {
  return matchText(option.label, input)
    || matchText(option.value, input)
    || matchText(option.searchText ?? "", input);
}
