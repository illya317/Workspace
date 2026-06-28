# Core UI `moduleView` Migration Register

`PageSurface` 的 `moduleView` 是历史逃生口，不是新增页面 API。后续迁移规则：

- `replace-now`：现有正式入口或 spec 已可表达，直接迁移；业务 runtime 不再直接使用 `FormSurface` / `DataSurface` / `NavigationSurface`。
- `core-gap`：现有 Surface contract 不够，先补公开契约，再替换业务侧。
- `defer`：不是单点 UI，可在下游子视图迁完后再处理宿主。
- `migrated`：已经迁出 `moduleView`，对应 baseline 已 ratchet。

当前进度：原始 68 项中 68 项已迁移，`businessModuleViewUsages` 当前剩余 0 项。

## Core Gap Backlog

| target | scope |
|---|---|
| `data-visual-spec` | 已补 `DataSurface kind="visual"`：time-series bar、grouped bar、comparative/bullet bar、hierarchy tree |
| `data-record-detail-surface` | 已补 `DataSurface records.detailSurface` + `display.stack`：展开记录内嵌 typed data surface，不再用 ReactNode 包 `<DataSurface>` |
| `document-block-spec` | 已补 `PageSurface` `document` block + Core `DocumentSurface` v1：治理 A4/纸面文档宿主、宽度、字体和多页容器；QC rows/cells/parts/fields/anchors 仍由 domain renderer 承担，作为后续 L3 document sub-spec 继续演进 |
| `page-split-slot` | split side / drawer / main content 的结构化 slot，不允许变成 generic render |
| `page-content-slot` | 页面主内容边界；只有在子内容已变成 blocks/surface contract 后才能接入 |
| `toolbar-menu-item` | 已补 Toolbar `kind="menu"`：trailing menu/dropdown trigger，例如账号菜单；Core 只表达菜单，不依赖 SessionUser/auth |
| `tabbed-block-host` | tabs/activeChild + typed `PageSurfaceBlockSpec[]` 或 embedded `PageSurfaceProps` 内容宿主，不接受 ReactNode/render callback |
| `page-module-host-spec` | 暂不补泛化宿主；剩余 shell-host 必须先拆成 toolbar menu、tabbed block host、document/navigation 等具体契约 |
| `surface-composition-spec` | 多 Surface 组合、嵌套 section、表格展开行、树表、复杂编辑器、交互卡片列表 |
| `form-segmented-code-control` | 已迁到普通 Form field：部门/岗位 code 通过 `InputControl control=text` + `mask.kind=editableSegment` 声明 segment extract/compose/normalize |
| `navigation-surface-spec` | 已补 `NavigationSurface kind="steps"` href/disabled link steps；树形部门/组织导航继续走 selector/tree specs |

## Register

| item | disposition | target | note |
|---|---|---|---|
| `packages/finance/ui/components/FinanceShell.tsx:user-menu` | migrated | Toolbar `kind="menu"` | Finance account menu now uses typed toolbar menu item; logout/settings behavior remains in FinanceShell |
| `packages/finance/ui/statements/ReportTab.tsx:balance-lines` | migrated | existing `surfaceGroup` + `data.table` + `message` | Finance balance report converted to typed blocks |
| `packages/finance/ui/statements/ReportTab.tsx:income-lines` | migrated | existing `message` + `data.table` | Income report converted to typed blocks |
| `packages/finance/ui/statements/ReportTab.tsx:cashflow-lines` | migrated | existing `message` + `data.table` | Cashflow report converted to typed blocks |
| `packages/hr/ui/analytics/ContractAnalytics.tsx:type-bars` | migrated | existing `data.table` | Simple distribution list converted |
| `packages/hr/ui/analytics/ContractAnalytics.tsx:company-bars` | migrated | existing `data.table` | Simple distribution list converted |
| `packages/hr/ui/analytics/DepartmentAnalytics.tsx:tree` | migrated | `DataSurface visual.tree` | Recursive department tree converted to typed hierarchy spec |
| `packages/hr/ui/analytics/EmployeeAnalytics.tsx:distribution-bars` | migrated | existing `data.table` | Simple distribution list converted |
| `packages/hr/ui/analytics/EmployeeAnalytics.tsx:cross-matrix` | migrated | existing `analysis` + `data.table` block/spec builder | Parent host now consumes typed block directly |
| `packages/hr/ui/analytics/HeadcountTrend.tsx:trend-chart` | migrated | `DataSurface visual.barChart` + `visual.groupedBarChart` | Multi-series compact trend chart converted to typed visual specs |
| `packages/hr/ui/analytics/HRAnalyticsClient.tsx:activeTab` | migrated | existing `PageSurface` tab blocks | Analytics tab bodies now expose typed `PageSurfaceBlockSpec[]` hooks; parent selects active blocks without JSX/moduleView |
| `packages/hr/ui/analytics/position/DeptBarChart.tsx:bars` | migrated | `DataSurface visual.comparisonBars` | Comparative/bullet bar with grouping and legend converted to typed visual spec |
| `packages/hr/ui/analytics/TurnoverAnalytics.tsx:monthly-chart` | migrated | `DataSurface visual.barChart` | Time-series bar chart converted to typed visual spec |
| `packages/hr/ui/analytics/TurnoverAnalytics.tsx:tenure-chart` | migrated | existing `data.table` | Simple distribution list converted |
| `packages/hr/ui/analytics/TurnoverAnalytics.tsx:reason-bars` | migrated | existing `data.table` | Searchable distribution list converted |
| `packages/hr/ui/components/GenericCreatePanel.tsx:fields` | migrated | existing `form.inline` + typed field mapping | Required-field create panel now maps FieldConfig to FormSurface field specs |
| `packages/hr/ui/generated/RosterGeneratedTab.tsx:table` | migrated | existing `data.structured` | Generated roster preview table converted to structured surface |
| `packages/hr/ui/HRClient.tsx:renderedView` | migrated | direct child `PageSurface` selection + shared Surface navigation props | HR roster parent now coordinates leave guard/focus state only; child views render their own `PageSurface` with shared tabs and child navigation |
| `packages/hr/ui/profile/EmployeeProfileFieldRegion.tsx:content` | migrated | typed `FormSurface` field/section blocks | Field region now receives typed `PageSurfaceBlockSpec[]`; field grids and row actions are expressed as Surface specs |
| `packages/hr/ui/profile/EmployeeProfileView.tsx:activeSection` | migrated | `PageSurface` tabs + active section blocks | Active profile tab now selects typed `PageSurfaceBlockSpec[]`; history details use `DataSurface records.detailSurface` instead of nested JSX |
| `packages/hr/ui/profile/ProfileFormControls.tsx:actions` | migrated | existing `PageSurface` section actions | Unused arbitrary action wrapper removed; future actions should be command specs |
| `packages/hr/ui/profile/ProfileFormControls.tsx:content` | migrated | typed `PageSurface` section blocks | `SectionShell` now accepts typed blocks only; callers no longer pass arbitrary children/moduleView content |
| `packages/hr/ui/tabs/department-position/active-workspace.tsx:desktop` | migrated | existing `PageSurfaceSideSpec.blocks` | Split side now receives typed blocks |
| `packages/hr/ui/tabs/department-position/active-workspace.tsx:drawer` | migrated | existing `PageSurfaceSideSpec.drawerBlocks` | Split drawer now receives typed blocks |
| `packages/hr/ui/tabs/department-position/active-workspace.tsx:content` | migrated | `page-split-slot` + typed content blocks | Active split workspace now receives `PageSurfaceBlockSpec[]` for main content instead of `children` |
| `packages/hr/ui/tabs/department-position/archive-browser.tsx:content` | migrated | `page-content-slot` + typed detail blocks | Archive wrapper now receives typed detail blocks; `renderDetailPane()` ReactNode host removed |
| `packages/hr/ui/tabs/department-position/department-create-panel.tsx:fields` | migrated | `FormSurface segmentedCode` + `form.fields` | Department create fields now use typed FormSurface specs; department code is expressed by `segmentedCode` instead of custom JSX |
| `packages/hr/ui/tabs/department-position/department-create-panel.tsx:content` | migrated | existing `panel` blocks + `DepartmentDescriptionsPanel` block builder | Create panel now composes typed department info and descriptions blocks directly; the remaining description details editor gap is tracked on `DepartmentDescriptionsPanel` |
| `packages/hr/ui/tabs/department-position/department-description-details-editor.tsx:content` | migrated | existing `PageSurface` panels + `FormSurface` tagList/fields | Department description details editor now emits typed panels/forms for summary, duties, and other fields |
| `packages/hr/ui/tabs/department-position/department-descriptions-panel.tsx:details` | migrated | existing `PageSurface` nested panels + editor block builder | Description collection now composes editor blocks directly and manages duty scroll refs at the collection level |
| `packages/hr/ui/tabs/department-position/department-detail-pane.tsx:content#1` | migrated | `page-content-slot` via typed `PageSurfaceBlockSpec[]` composition | Detail workspace now composes empty state, direct positions, department info, descriptions, and position editor blocks without ReactNode host |
| `packages/hr/ui/tabs/department-position/department-detail-pane.tsx:content#2` | migrated | `FormSurface` segmentedCode/tagList/fields + `DataSurface` metrics | Department info form, aliases, dirty/save/archive chrome, and metrics are now typed panel blocks |
| `packages/hr/ui/tabs/department-position/detail-editor-complex-fields.tsx:work-environments#1` | migrated | existing `form.repeatable` + `form.tagList` | Work environment editor converted to FormSurface repeatable |
| `packages/hr/ui/tabs/department-position/detail-editor-complex-fields.tsx:work-environments#2` | migrated | existing `form.repeatable` + `form.tagList` | Nested work environment item converted to typed fields |
| `packages/hr/ui/tabs/department-position/detail-editor-complex-fields.tsx:experience-requirements#1` | migrated | existing `form.repeatable` + `form.fields` | Experience requirement list converted to FormSurface repeatable |
| `packages/hr/ui/tabs/department-position/detail-editor-complex-fields.tsx:experience-requirements#2` | migrated | existing `form.repeatable` + `form.fields` | Nested experience row converted to typed fields |
| `packages/hr/ui/tabs/department-position/navigation-panels.tsx:title` | migrated | existing `panel.title` / `actions` | Title/count/create moved to panel chrome |
| `packages/hr/ui/tabs/department-position/navigation-panels.tsx:positions` | migrated | existing `navigation.selector.grid` | Direct position selector converted |
| `packages/hr/ui/tabs/department-position/navigation-panels.tsx:create` | migrated | existing `panel` + `form.fields` block builder | `PositionCreatePanel` now exposes reusable typed block |
| `packages/hr/ui/tabs/department-position/navigation-panels.tsx:departments` | migrated | existing `navigation.selector.tree` blocks | Department tree emits typed navigation blocks |
| `packages/hr/ui/tabs/department-position/navigation-panels.tsx:roots` | migrated | existing `navigation.selector` + `surfaceGroup` blocks | Organization root list emits typed navigation blocks |
| `packages/hr/ui/tabs/department-position/organization-mode-panel.tsx:desktop` | migrated | existing `PageSurfaceSideSpec.blocks` | Split side now receives typed blocks |
| `packages/hr/ui/tabs/department-position/organization-mode-panel.tsx:drawer` | migrated | existing `PageSurfaceSideSpec.drawerBlocks` | Split drawer now receives typed blocks |
| `packages/hr/ui/tabs/department-position/organization-mode-panel.tsx:header` | migrated | existing `panel.title` + `FormSurface` control/action | Manager autocomplete moved into panel title and save into panel action |
| `packages/hr/ui/tabs/department-position/organization-view.tsx:desktop` | migrated | removed orphan view | File had no imports and was deleted |
| `packages/hr/ui/tabs/department-position/organization-view.tsx:drawer` | migrated | removed orphan view | File had no imports and was deleted |
| `packages/hr/ui/tabs/department-position/organization-view.tsx:organization-header` | migrated | existing `panel.title` | Root department header moved to panel chrome |
| `packages/hr/ui/tabs/department-position/organization-view.tsx:organization-children` | migrated | removed orphan view | File had no imports and was deleted |
| `packages/hr/ui/tabs/department-position/position-description-panel.tsx:content` | migrated | `FormSurface` fields/repeatable/tagList + panel actions | Position description template controls, summary fields, detail groups, duties, history, entity refs, and repeatable editors now use typed Surface specs |
| `packages/hr/ui/tabs/department-position/position-description-repeatable-sections.tsx:duty.content` | migrated | existing `form.repeatable` + `form.tagList` | Duty repeatable section converted to typed FormSurface repeatable |
| `packages/hr/ui/tabs/department-position/position-description-repeatable-sections.tsx:history.content` | migrated | existing `form.repeatable` + `form.fields` | Change-history repeatable section converted to typed FormSurface repeatable |
| `packages/hr/ui/tabs/department-position/position-description-template-editor.tsx:content` | migrated | existing `panel` + `form.inline` + `surfaceGroup.grid` | Template editor shell converted to typed blocks |
| `packages/hr/ui/tabs/department-position/position-description-template-editor.tsx:fields` | migrated | existing `form.inline` checkbox fields | Template field groups converted to typed form fields |
| `packages/hr/ui/tabs/department-position/position-editor.tsx:content` | migrated | `FormSurface` segmentedCode/tagList/fields + panel actions | Position info panel now uses typed `PageSurface` panel chrome and `FormSurface` fields; description panel remains separately tracked |
| `packages/production/ui/qc/QcBatchStagePrecheck.tsx:precheck-header` | migrated | `NavigationSurface` link steps + `PageSurface` heading | QC precheck navigation now uses typed href/disabled steps and heading block |
| `packages/production/ui/qc/QcBatchStagePrecheck.tsx:precheck-paper` | migrated | `PageSurface` document block + `DocumentSurface` v1 | Precheck paper now uses the document block host; QC layout rows/cells/reference values remain inside the domain document renderer |
| `packages/production/ui/qc/QcBatchStagePrecheck.tsx:precheck-actions` | migrated | existing `form.inline` block | Save action converted |
| `packages/production/ui/qc/QcBatchTestRecord.tsx:test-record-paper` | migrated | `PageSurface` document block + `DocumentSurface` v1 | Test record paper and fallback method table now use the document block host; formula/reference/readOnly internals remain domain document sub-spec work |
| `packages/production/ui/qc/QcModuleShell.tsx:content` | migrated | shell chrome `PageSurface` + direct AppShell content region | QC shell summary/panels remain typed `PageSurface` blocks; child content is no longer tunneled through `PageSurface.moduleView` |
| `packages/production/ui/qc/QcTemplateDetail.tsx:stage.key` | migrated | existing `data.table` block | Stage DataSurface converted |
| `packages/production/ui/qc/template-workbench/TemplatePreviewModal.tsx:template-preview-body` | migrated | `PageSurface` document block + `DocumentSurface` v1 | Template preview modal now uses the document block host for multi-document preview, advanced/inspect mode, and inline feedback regions |
| `packages/work/ui/meetings/MeetingsPage.tsx:meeting-detail` | migrated | `PageSurface` panel/form block shell | Meeting detail now exposes a typed block; proposal/vote/decision/candidate workflows remain scoped composition gaps inside the detail block |
| `packages/work/ui/tabs/ProjectTab.tsx:activeChild` | migrated | direct child `PageSurface` selection + typed blocks | Project child views now render their own `PageSurface` with shared tabs; top-level activeChild `moduleView` host removed |
| `packages/work/ui/tabs/ProjectTab.tsx:project-detail` | migrated | `PageSurface` panel/form/data/navigation blocks | Project detail shell now emits typed blocks; remaining plan/task sub-sections are tracked under composition gaps rather than page-level `moduleView` |
| `packages/work/ui/works/WorksClient.tsx:permissions` | migrated | existing `form` + `data.table` + `form.inline` | Permission panel now exposes typed PageSurface blocks |
| `packages/work/ui/works/WorksClient.tsx:reports-panel` | migrated | existing `data.table` / `data.records` block builders | Work report fill/collection views now emit typed data blocks |
| `packages/work/ui/works/WorksClient.tsx:create-task` | migrated | existing `form.fields` | Work task create form now exposes and consumes FormSurface props |
| `packages/work/ui/works/WorksClient.tsx:task-table` | migrated | existing `data.table` + typed expanded row | Work task tree table now exposes a typed data block builder |
