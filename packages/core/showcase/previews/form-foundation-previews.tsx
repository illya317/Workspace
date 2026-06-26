"use client";

import type { FC } from "react";

function foundationPreview(name: string, description: string) {
  return function FoundationPreview() {
    return (
      <div className="text-xs text-slate-400">
        <p className="font-medium">{name}</p>
        <p>{description}</p>
        <p className="mt-1 text-slate-300">Foundation / 样式 recipe，无运行时组件预览。</p>
      </div>
    );
  };
}

export const getFieldInputClassNamePreview = foundationPreview("getFieldInputClassName", "字段输入框样式 token，用于少量需要业务自渲染输入的场景。");
export const getFieldGridCellClassNamePreview = foundationPreview("getFieldGridCellClassName", "字段网格单元容器样式 token，由 main row 与可选 helper row 组成，避免说明文案撑高同行。");
export const getFieldGridMainRowClassNamePreview = foundationPreview("getFieldGridMainRowClassName", "字段网格主行样式 token，固定 label + value 行高，隔离 helper 行高影响。");
export const getFieldGridHelperRowClassNamePreview = foundationPreview("getFieldGridHelperRowClassName", "字段网格辅助行样式 token，短提示落入独立行，不干扰主体字段对齐。");
export const getFieldGridLabelClassNamePreview = foundationPreview("getFieldGridLabelClassName", "字段网格 label 样式 token，用于自渲染字段网格时统一标签列视觉。");
export const getFieldGridValueClassNamePreview = foundationPreview("getFieldGridValueClassName", "字段网格值区域样式 token，用于自渲染字段网格时统一值区布局。");
export const getFieldGroupTitleClassNamePreview = foundationPreview("getFieldGroupTitleClassName", "字段分组标题样式 token，用于表单详情页的分组标题。");
export const getReadOnlyFieldClassNamePreview = foundationPreview("getReadOnlyFieldClassName", "只读字段样式 token，用于展示不可编辑但仍属于表单布局的字段。");
export const getTagInputShellClassNamePreview = foundationPreview("getTagInputShellClassName", "标签输入外壳样式 token，统一 Tag 输入容器焦点和边框状态。");
export const getTagInlineInputClassNamePreview = foundationPreview("getTagInlineInputClassName", "标签内联输入样式 token，用于 chip 输入末尾的轻量文本输入。");
export const getTagPillClassNamePreview = foundationPreview("getTagPillClassName", "标签项样式 token，统一别名、标签和可删除 chip 外观。");

export const foundationFormPreviewByName: Record<string, FC> = {
  getFieldInputClassName: getFieldInputClassNamePreview,
  getFieldGridCellClassName: getFieldGridCellClassNamePreview,
  getFieldGridMainRowClassName: getFieldGridMainRowClassNamePreview,
  getFieldGridHelperRowClassName: getFieldGridHelperRowClassNamePreview,
  getFieldGridLabelClassName: getFieldGridLabelClassNamePreview,
  getFieldGridValueClassName: getFieldGridValueClassNamePreview,
  getFieldGroupTitleClassName: getFieldGroupTitleClassNamePreview,
  getReadOnlyFieldClassName: getReadOnlyFieldClassNamePreview,
  getTagInputShellClassName: getTagInputShellClassNamePreview,
  getTagInlineInputClassName: getTagInlineInputClassNamePreview,
  getTagPillClassName: getTagPillClassNamePreview,
};
