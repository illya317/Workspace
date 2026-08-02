export const REVIEWED_UI_SPECIALIZED_SURFACES = [
  { file: "packages/platform/document-editor/DocumentWorkspaceSurface.tsx", seam: "document-workspace", granularity: "deep-module" },
  { file: "packages/platform/ui/workflow/StageFlowSurface.tsx", seam: "stage-flow", granularity: "deep-module" },
  { file: "packages/production/ui/qc/QcEditorRuntimePaper.tsx", seam: "qc-runtime-paper", granularity: "deep-module" },
  { file: "packages/platform/ui/page-assistant/PageAssistantComposer.tsx", seam: "page-assistant-composer", granularity: "deep-module" },
  { file: "packages/platform/ui/page-assistant/PageAssistantMessages.tsx", seam: "page-assistant-messages", granularity: "deep-module" },
  { file: "packages/platform/ui/auth/WecomLoginPanel.tsx", seam: "wecom-login-panel", granularity: "deep-module" },
  { file: "packages/settings/ui/admin/tabs/WorkflowPoliciesBpmnCanvasLayout.tsx", seam: "workflow-bpmn-canvas", granularity: "deep-module" },
  { file: "packages/settings/ui/admin/tabs/WorkflowPoliciesBpmnElementModal.tsx", seam: "workflow-bpmn-element-editor", granularity: "deep-module" },
] as const;

export const REVIEWED_UI_SPECIALIZED_SURFACE_FILES = new Set<string>(
  REVIEWED_UI_SPECIALIZED_SURFACES.map((surface) => surface.file),
);
