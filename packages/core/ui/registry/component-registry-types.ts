export type CoreUiDeclarationCategory = "page-layout" | "page-content" | "common";

export type CoreUiCapabilityDescriptor = {
  name: string;
  description: string;
  children?: readonly CoreUiCapabilityDescriptor[];
};

export type CoreUiComponentRegistration = {
  name: string;
  description: string;

  // 业务/Agent 可声明的字段项。
  declares?: readonly CoreUiCapabilityDescriptor[];

  // 完整契约树只作为生成/检查产物；声明式 Surface registry 不挂载它。
  contract?: readonly CoreUiCapabilityDescriptor[];

  // 非 Surface 入口提供的能力说明，不作为 UI 声明协议。
  capabilities?: readonly CoreUiCapabilityDescriptor[];

  // 组件或 helper 直接组合了哪些 core UI 入口。
  composes?: readonly string[];
};

export type CoreUiCompositionGraph = {
  composes: ReadonlyMap<string, readonly string[]>;
  usedBy: ReadonlyMap<string, readonly string[]>;
};
