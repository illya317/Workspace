import type {
  CoreUiDeclarationCategory,
  CoreUiComponentRegistration,
} from "./component-registry-types";

export type CoreUiComponentTreeNode = {
  component: CoreUiComponentRegistration;
  name: string;
  category: CoreUiDeclarationCategory;
};
