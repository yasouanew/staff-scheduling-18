# Task 8–10 Audit: Branches, Departments, and Positions

**Project:** Rosterly staff-scheduling SaaS  
**Scope:** Existing frontend surfaces for branches, departments, and positions. No application code was modified for this audit.  
**Audit date:** 17 August 2026

## Executive assessment

Branches, departments, and positions form a coherent company-administration management suite. All three are protected by the `company_admin` route group, appear only for company administrators in navigation, use real CRUD API hooks, invalidate their query families after mutations, and follow a common page composition: page header, KPI cards, status filter, table, create/edit drawer, delete confirmation, and toast feedback.

The main weakness is not missing functionality; it is **repetition and inconsistent design-system adoption**. None of the three feature groups imports the new local `@/Components/ui` primitives. They contain three raw Radix dialog implementations, six repeated field/select styling declarations, and ten files with raw buttons. This is the next clear migration opportunity after the shell and shared-foundation work.

| Task | Current maturity | Primary finding | Recommended priority |
| --- | --- | --- | --- |
| **Task 8 — Branches** | Functionally mature API-backed CRUD | Strongest workflow, including view/detail navigation and manager/timezone data, but repeated raw table/drawer patterns | **High** |
| **Task 9 — Departments** | Functionally mature API-backed CRUD | Persisted colour and position-count data are useful, but colour input and form errors need semantic treatment | **High** |
| **Task 10 — Positions** | Functionally mature API-backed CRUD | Department/pay-scale contract is present, but page-level KPI values and dependency loading need scale review | **High** |

## Current architecture and access boundaries

The three pages are in the company-administrator route group. Scheduler and employee roles do not receive these routes, and the navigation metadata also assigns Branches, Departments, and Positions to `COMPANY_ADMIN_ONLY`. This is consistent with the stated product boundary: schedulers manage rosters, shifts, and leave, while company administrators manage team configuration.

| Feature | Route | API contract | Supporting workflow |
| --- | --- | --- | --- |
| Branches | `/branches`, `/branches/:id` | `/branches`, `/branches/:id` with list/detail/create/update/delete | Branch manager, phone, address, timezone, status, detail navigation, active branch options for dependent selects |
| Departments | `/departments` | `/departments`, `/departments/:id` with list/detail/create/update/delete | Name, code, description, persisted colour, status, position count |
| Positions | `/positions` | `/positions`, `/positions/:id` with list/detail/create/update/delete | Name, department relation, hourly rate, colour, status, server-side department filtering |

All three data layers are genuinely API-backed. Their hooks define query-key registries, DTO-to-domain mapping, create/update/delete transport functions, and invalidation after successful mutations. Branches additionally expose active-only branch options for dependent forms; positions expose a server-side department filter; departments map persisted `positions_count` and `color` fields.

## Cross-feature strengths

The management suite has a reliable structural pattern. Each list page owns its status filter and create/edit state, delegates tabular presentation to a feature table, and uses dedicated mutation hooks for deletion. Create/edit forms use React Hook Form and Zod, reset when the drawer opens or the target changes, and report successful or failed mutations through Sonner toasts.

The pages have good baseline responsive intent. Tables use progressively hidden columns at `sm`, `md`, `lg`, and `xl` breakpoints, while the page header and KPI rows collapse into single-column or stacked layouts on narrow screens. Every inspected feature button includes an explicit type, and focus-visible classes are widely present. No unsafe `any`, TODO marker, or direct hex literal was found in the feature source itself; the only hex matches are validation patterns for the persisted user-facing colour fields in department and position schemas.

## Task 8 — Branches

### Functional findings

The branch feature is the richest of the three. It supports list filtering, server-backed branch data, detail navigation, manager association, timezone, phone, address, active/inactive status, create, edit, and delete. The `useBranchOptions` helper reuses the branch list endpoint to provide active branches to other forms, which is a good example of shared domain data.

The page loads up to 100 rows and delegates search, sorting, pagination, and column visibility to `BranchesTable`. The table provides view, edit, and delete actions through a row menu. Delete is protected by an alert confirmation and gives success/error toast feedback.

| Finding | Impact | Recommendation |
| --- | --- | --- |
| Raw Radix menu and alert dialog in the table | Menu/dialog behaviour is separate from the local shadcn layer | Migrate to `DropdownMenu` and `AlertDialog` from `@/Components/ui`. |
| Branch form repeats raw field classes | Input, select, textarea, validation, and footer actions can drift | Migrate to `Field`, `Input`, `Textarea`, `Select`, `Button`, and `Dialog`/drawer primitives. |
| Manager select loads employee data inside every branch form | Large employee lists may make the form heavy; branch manager options are not clearly scoped | Add an active-manager option query or searchable selection when the employee count grows. |
| Table-level search/pagination is abstracted but list requests use `perPage: 100` | A large company may receive a large payload before local table operations | Confirm whether `DataTable` pagination is client-only; prefer API pagination for large tenants. |
| Error messages are visible but not linked to fields | Assistive technologies may not receive the validation context | Use field primitives that generate and connect `aria-describedby` IDs. |

## Task 9 — Departments

### Functional findings

The department feature mirrors branches closely: status-filtered API list, KPI totals and active/inactive counts, create/edit drawer, table operations, and delete confirmation. Department data also includes persisted `color` and `positions_count`, which makes the feature useful as a configuration hub for positions and reporting.

The form includes name, code, description, status, and a colour swatch picker. The colour value is part of the domain contract rather than only a CSS decoration, so it requires a deliberate product decision: retain arbitrary supported colours with safe rendering, or constrain the input to a semantic application palette.

| Finding | Impact | Recommendation |
| --- | --- | --- |
| Persisted colour is represented as a hex string | Arbitrary user colour can reduce contrast or conflict with light/dark semantic tokens | Prefer a token-backed palette with contrast-tested options; if arbitrary colours remain supported, validate contrast and use them only for decorative swatches. |
| Colour picker uses inline `backgroundColor` | It is a controlled visual exception to the semantic-colour rule | Encapsulate it in a dedicated accessible colour-token component and document the exception. |
| Department form repeats branch/position form mechanics | Changes must be made in multiple files | Extract a shared management drawer shell and shared field/error layout. |
| No visible position relationship action in the department list | Users may not immediately understand the impact of deactivating a department with positions | Show a position count and dependency warning before destructive status/delete changes. |
| Raw table actions and feedback | Same consistency issue as branches | Migrate to shared menu, confirmation, badge, table, and feedback primitives. |

## Task 10 — Positions

### Functional findings

The position feature is API-backed and has the richest dependent-data contract. It maps a department relation, default hourly rate, status, and colour; serializes create/update payloads; supports server-side department filtering; and invalidates list/detail queries after mutations.

The list page displays total positions, active positions, and an average hourly pay-scale KPI. Because the page requests a fixed `perPage: 100` and calculates the average from the loaded `positions` array, the KPI should be treated as page-scoped unless the backend provides a true aggregate. If more than 100 positions exist, the displayed average could be incomplete.

| Finding | Impact | Recommendation |
| --- | --- | --- |
| Average hourly rate is calculated from loaded rows | KPI may be wrong for paginated or filtered data | Move aggregate calculation to the API or label it as the current loaded-result average. |
| Department dependency is present but needs empty/loading guidance | A user may attempt to create a position before departments are available | Disable submit until a valid department exists and provide a direct “Create department” path when appropriate. |
| Pay-scale input requires domain-specific formatting | Currency and decimal errors can create confusing validation | Use a typed currency field with AUD formatting, numeric constraints, and an explicit hourly-rate explanation. |
| Position colour repeats the department colour issue | Arbitrary colours can conflict with semantic theme tokens | Use a shared token palette or encapsulated validated colour component. |
| Raw drawer/table/menu implementation | Position screens diverge from the approved local UI library | Migrate to the shared form, dialog, dropdown, table, badge, and feedback primitives. |

## Design-system and duplication assessment

The three features currently have **zero imports from `@/Components/ui`**. They use common `StatCard`, `LoadingSpinner`, and status helpers, but continue to style controls directly and import raw `@radix-ui/react-dialog` in three feature form files.

| Repeated surface | Evidence | Refactoring target |
| --- | --- | --- |
| Page headers | Three list pages each repeat title, description, and primary-action markup | `PageHeader` with an action slot. |
| KPI cards | All three use `StatCard` but may need a documented relationship to local `Card` | Retain `StatCard` as a domain composition built on local `Card`; avoid parallel card styling. |
| Status filters | Three pages repeat `ALL_VALUE`, `selectClasses`, and status mapping | Shared `StatusFilter` using local `Select`. |
| Error/retry panels | Each page repeats alert icon, copy, button, and card layout | Shared `ErrorState` with retry callback and feature-specific copy. |
| Form drawers | Three raw Radix drawer implementations repeat header, close, scroll body, footer, and submit states | Shared drawer/sheet composition with local `Dialog`, `Button`, `Field`, and feedback primitives. |
| Tables | Three feature tables repeat row menus, alert confirmations, responsive metadata, and status presentation | Shared `ResourceTable` conventions; retain feature-specific column definitions. |
| Delete workflow | Each page calls a mutation and renders success/error toasts | Shared mutation feedback helper plus standard `AlertDialog` confirmation. |

## Accessibility and responsive assessment

The feature source has good foundational signals: explicit button types, widespread visible focus styles, `aria-invalid` on form controls, and responsive table metadata. However, the form errors are generally rendered as plain paragraphs without stable IDs referenced from `aria-describedby`. This is the most concrete accessibility gap in the current CRUD forms. The local `Field` and `FieldError` primitives created earlier should become the standard fix.

The tables intentionally hide lower-priority columns at smaller breakpoints, but this should be visually tested at 320 px, 375 px, 768 px, and desktop widths. A row with a long branch name, department name, or position name should not push the action menu off-screen. If the table abstraction only paginates loaded data, narrow-screen behaviour may be good while large-tenant performance remains weak.

The persisted colour fields are a special case. The audit did not classify their validation regex as a hard-coded UI colour violation; it is a domain input contract. Nevertheless, arbitrary colours must not be allowed to reduce text contrast or bypass the semantic light/dark design system. A validated token palette is the safer default.

## Role and workflow observations

Access control is consistently company-admin-only in both the route group and navigation metadata. This is appropriate for branches, departments, and positions because these resources configure company-wide roster structure. Scheduler users retain access to operational rosters and shifts but do not receive configuration-management navigation.

The shared domain relationships should be made explicit in future workflow work. Branches reference employees as managers; positions reference departments; departments report position counts; and other scheduling forms consume active branches, departments, and positions. Deleting or deactivating a resource therefore needs dependency-aware confirmation. The UI should explain whether the operation is blocked, cascaded, or simply removes the resource from future selection options.

## Recommended refactoring order

| Priority | Work | Rationale |
| --- | --- | --- |
| **8–10.1** | Create a shared company-resource page shell with `PageHeader`, KPI row, filter row, table region, and mutation feedback slots | Removes the largest repeated page-level structure without changing domain behaviour. |
| **8–10.2** | Create a shared drawer form shell and migrate branch, department, and position fields to local `Field`, `Input`, `Textarea`, `Select`, and `Button` primitives | Improves consistency and fixes linked validation errors. |
| **8–10.3** | Migrate row menus and delete confirmation to local `DropdownMenu` and `AlertDialog` | Standardises keyboard navigation, focus management, and destructive actions. |
| **8–10.4** | Make pagination and search server-aware where tenant size requires it | Prevents fixed 100-row limits from producing incomplete lists and KPIs. |
| **8–10.5** | Add dependency-aware status/delete messaging | Makes branch manager, department, and position relationships safe to manage. |
| **8–10.6** | Replace arbitrary colour choices with an accessible semantic palette or validated colour-token component | Keeps user-configurable colours compatible with light and dark modes. |
| **8–10.7** | Add scenario coverage | Test role denial, empty data, API failure, duplicate names/codes, dependent-resource conflicts, mutation invalidation, and narrow mobile tables. |

## Audit evidence

| Source | Key observation |
| --- | --- |
| `features/branches/pages/BranchesListPage.tsx` | Status-filtered branch directory with KPI cards, CRUD drawers, detail navigation, and delete feedback. |
| `features/branches/hooks/useBranches.ts` | Real branch CRUD transport, query keys, invalidation, and active branch options. |
| `features/branches/components/BranchesTable.tsx` | DataTable-based responsive branch table with raw row menu and alert confirmation. |
| `features/branches/components/BranchFormModal.tsx` | Raw Radix drawer, repeated field classes, manager dependency, and inline form errors. |
| `features/departments/pages/DepartmentsListPage.tsx` | Status-filtered department directory with active/inactive KPIs and CRUD flow. |
| `features/departments/hooks/useDepartments.ts` | Real department CRUD transport, persisted colour, and position-count mapping. |
| `features/departments/components/DepartmentFormModal.tsx` | Raw dialog form with colour swatches and unlinked error paragraphs. |
| `features/positions/pages/PositionsListPage.tsx` | Status-filtered positions directory with average hourly-rate KPI and CRUD flow. |
| `features/positions/hooks/usePositions.ts` | Real position CRUD transport, department filtering, rate mapping, and cache invalidation. |
| `routes/AppRoutes.tsx` and `Components/layout/nav-items.ts` | Branches, Departments, and Positions are restricted to `company_admin`. |

## References

[1]: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ "W3C WAI-ARIA Authoring Practices — Modal Dialog Pattern"
[2]: https://www.w3.org/WAI/ARIA/apg/patterns/menubutton/ "W3C WAI-ARIA Authoring Practices — Menu Button Pattern"
