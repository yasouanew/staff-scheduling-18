# Task 11–12 Audit: Availability and Shift Templates

**Project:** Rosterly staff-scheduling SaaS  
**Scope:** Existing frontend surfaces for availability and shift templates. No application code was modified for this audit.  
**Audit date:** 17 August 2026

## Executive assessment

The availability implementation contains two materially different data paths. The employee-specific availability editor at `/employees/:id/availability` is a substantial real API-backed workflow with draft editing, grid/list views, atomic weekly synchronisation, unsaved-change protection, remote-update detection, and explicit forbidden/error handling. By contrast, the `/availability` dashboard still uses a **mock and in-memory data layer** for employee options, weekly availability, and leave requests.

The shift-template domain has a promising data layer and a presentational table, but it is not currently a complete user-facing feature. There is no active shift-template page, no route, no navigation item, no visible create/edit form, and no external consumer of `ShiftTemplatesTable` or `useShiftTemplates`. The backend-capable hook and orphaned components therefore need a page/workflow before Task 12 can be considered complete.

| Task | Current maturity | Primary finding | Recommended priority |
| --- | --- | --- | --- |
| **Task 11 — Availability** | Real employee editor plus mock dashboard | Two competing sources of truth exist; the dashboard duplicates leave/availability behaviour with simulated records | **Critical** |
| **Task 12 — Shift Templates** | API hook and table only | No user-facing route or form exposes the feature | **Critical** |

## Current architecture and access boundaries

The `/availability` dashboard and `/employees/:id/availability` editor are restricted to `company_admin` in the route tree, and only the dashboard is exposed in navigation. The employee-specific editor is reached from the company-admin employee directory. Scheduler users can manage rosters and shifts but currently do not receive an availability navigation item or route through this feature group.

| Surface | Current entry point | Data source | Current role scope |
| --- | --- | --- | --- |
| Availability dashboard | `/availability` | `useAvailability` and `useLeaveRequests` mock/in-memory layer | `company_admin` |
| Employee availability editor | `/employees/:id/availability` | `useEmployeeAvailability` and `useEmployee` real API hooks | `company_admin` |
| Shift-template domain | No active route or navigation item | `useShiftTemplates` real API hooks; table/preview components are present | No user-facing scope currently |

## Task 11 — Availability

### Employee-specific editor strengths

The employee availability editor is the strongest implementation in this task. It loads employee identity and weekly availability through API-backed hooks, maps backend DTOs into stable domain types, and persists the entire week through an atomic sync endpoint. The draft/baseline model prevents partially painted weeks from being persisted, and the editor detects remote changes while the user is editing.

The editor supports desktop grid and mobile list views, a standard-week preset, range editing, delete/clear confirmation, save-state feedback, browser-level `beforeunload` protection, and an explicit 403 permission presentation. The draft conversion utilities keep calculations such as total weekly minutes and active days separate from the view components.

| Strength | Why it matters |
| --- | --- |
| Atomic weekly sync | Prevents partial availability updates from reaching the roster engine. |
| Draft versus baseline comparison | Makes unsaved changes explicit and prevents accidental overwrite. |
| Remote update detection | Warns when someone else changed the employee’s availability while it is open. |
| Grid/list responsive views | Recognises that a dense weekly grid is not suitable for every viewport. |
| Real API and cache update | Uses nested employee-availability endpoints and writes the sync response back to the employee-specific query cache. |
| Explicit forbidden handling | Distinguishes permission denial from a generic data failure. |

### Availability dashboard risks

The `/availability` dashboard is not connected to the same source of truth. Its `useAvailability.ts` file explicitly describes an isolated mock/network-simulation layer, hardcodes three employee options, stores recurring availability in memory, and stores leave requests in a module-level array. The dashboard’s “Base Availability” tab therefore cannot represent the employees or records in the authenticated company.

The same dashboard also implements a separate leave-request list, creation path, approval path, and rejection path even though the project already contains a dedicated real leave-request feature. This creates a high-risk split: a manager can approve a simulated request in one screen while the operational leave-request system remains unchanged.

| Finding | Evidence | Impact | Recommendation |
| --- | --- | --- | --- |
| Mock availability source | Hardcoded `AVAILABILITY_EMPLOYEES` and `AVAILABILITY_STORE` | Employee choices and weekly hours are not tenant data | Replace with active employee API data and the real employee-availability hook. |
| Mock leave source | Module-level `leaveRequestStore`, simulated fetch/create/approve/reject functions | Approval state is not shared with the real leave workflow or notification system | Remove the duplicate workflow and compose the existing leave-request API/feature. |
| Nested query client | `AvailabilityDashboard` creates its own `QueryClientProvider` | Cache, retry, and invalidation policy can diverge from the application provider | Use the root QueryClient. |
| Incomplete mock error state | Base availability only consumes `data` and `isLoading`; the mock cannot model real failure | Production failure, unauthorized access, and empty employee states are not designed | Use real queries and standard loading, empty, forbidden, and error states. |
| Company-admin-only visibility | `/availability` and navigation are restricted to `company_admin` | Schedulers cannot inspect availability from this feature, even though it affects roster planning | Confirm the product rule. If schedulers need read access, split read and write permissions rather than broadening access blindly. |
| Duplicated breadcrumb | Employee editor renders its own breadcrumb | Shell breadcrumb and feature breadcrumb can diverge | Use the shared route-aware shell breadcrumb or a common breadcrumb primitive. |

### Interaction and accessibility assessment

The availability editor includes useful semantic behaviour: view switching uses `aria-pressed`, buttons have explicit types, focus-visible styles are present, destructive clearing is confirmed through an alert dialog, and the editor exposes visible loading, error, empty, and forbidden states. However, it still uses raw Radix dialog primitives and local button class constants instead of the approved local shadcn-style components.

The base dashboard uses a raw native select, manually styled tabs, raw approval/rejection buttons, and a custom table column definition. The tabs have an accessible label and the row actions have explicit button types, but the entire surface should be migrated to the local `Tabs`, `Select`, `Button`, `Badge`, `Table`, and feedback primitives. Form errors in availability modals should use linked field-error IDs through the shared `FieldError` convention.

The grid/list approach should be tested at 320 px, 375 px, 768 px, and desktop widths. The list view is the correct mobile fallback, but the editor must preserve clear day labels, time range affordances, save state, and destructive actions without relying on colour alone.

## Task 12 — Shift Templates

### Data-layer strengths

`useShiftTemplates` has the beginnings of a production-ready domain layer. It defines list/detail/create/update/delete requests against `/shift-templates`, maps template DTOs into a stable domain shape, supports status and department/branch scope fields, and invalidates the template cache after mutations. Applying a template invalidates roster and shift queries, which correctly reflects the downstream effect of generating a real shift.

The time utilities are also a useful domain boundary. The table can represent overnight shifts, break minutes, paid hours, default roles, and branch/department scope without putting time arithmetic directly into the table markup.

### Missing user-facing workflow

The main Task 12 gap is not polish; it is discoverability and completeness. A source scan found no external page import for `useShiftTemplates`, `ShiftTemplatesTable`, or `ShiftTemplatePreview`. There is no shift-template route or navigation entry, and no visible create/edit form component under the feature directory. The table is therefore orphaned despite having callbacks for edit, duplicate, use, and delete.

| Missing surface | Consequence | Recommendation |
| --- | --- | --- |
| List page | Users cannot browse templates or access the table | Add a company-admin or scheduler-authorised template workspace according to the product permission decision. |
| Create/edit form | CRUD hooks cannot be used from the UI | Add a validated form for name, start/end time, break, paid-break state, status, default position, branch, department, and colour/scope. |
| Route and navigation | Feature is undiscoverable | Add an explicit route and navigation item, or expose templates only inside the shifts/rosters workflow with a clear entry point. |
| Apply flow | The table callback exists but has no active parent | Connect “Create shift from template” to the existing shift-create flow and preserve roster/date context. |
| Duplicate flow | Callback contract exists but no parent can prefill a form | Implement duplicate as a create-mode form with a clear copied-from indicator. |
| Conflict preview | Template application may conflict with employee/roster rules | Show validation/conflict results before creating a shift where the backend supports them. |

### Table and design-system findings

The template table has good content modelling and responsive column metadata: time is hidden below `md`, duration below `sm`, break below `lg`, and payable/scope information below `xl`. It provides an accessible per-row action label, overnight status text, and a destructive confirmation that explains existing shifts are unaffected.

The table nevertheless uses raw Radix dropdown and alert-dialog imports, raw buttons, and repeated menu classes rather than the local UI primitives. The colour avatar applies a user-provided hex value inline, which is a domain-data exception similar to department and position colours. It should be kept inside a validated, contrast-aware colour component rather than spread through table cells.

### Shift-template workflow and role questions

The product must make one explicit authorization decision before implementation: should templates be managed by company administrators only, by both company administrators and schedulers, or by a narrower scheduling permission? The existing downstream operation—creating shifts and invalidating rosters—suggests scheduler access may be appropriate, but the current route model does not establish this because the feature has no route at all.

Template scope also needs a clear precedence model. A template can be global, branch-scoped, department-scoped, or associated with a default position. The UI should explain which scope fields are optional, how a template appears in a scheduler’s list, and whether a narrower branch/department template overrides a global one.

## Cross-feature duplication and recommended consolidation

| Repeated surface | Current evidence | Recommended shared target |
 --- | --- | --- |
| Tabs and segmented controls | Raw tabs in the availability dashboard and raw `aria-pressed` view switcher in the employee editor | Local `Tabs` or a documented segmented-control primitive. |
| Form fields | Native inputs/selects and local class strings in availability forms | `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, and `FieldError`. |
| Drawers/dialogs | Raw Radix dialogs across availability and template table actions | Local `Dialog`/sheet/alert-dialog primitives. |
| Feedback | Common error/loading helpers plus page-local error panels | Standard `LoadingState`, `EmptyState`, `ErrorState`, and forbidden state compositions. |
| Breadcrumbs | Employee availability defines its own breadcrumb | Shared shell breadcrumb with optional feature-level additions. |
| Actions | 28 raw buttons across the audited features | Local `Button` variants, including success/danger/outline/ghost semantics. |
| Query providers | Availability dashboard creates a feature-local client | Root QueryClient only. |

## Recommended implementation order

| Priority | Work | Outcome |
 --- | --- | --- |
| **11.1** | Replace the mock availability dashboard employee selector and weekly data with real employee/availability queries | One authoritative availability source. |
| **11.2** | Remove the duplicate mock leave-request workflow and compose the existing leave-request feature | Approvals, notifications, and calendar blocking remain consistent. |
| **11.3** | Migrate the employee availability editor to local UI primitives | Consistent fields, buttons, breadcrumbs, dialogs, feedback, and theme behaviour. |
| **12.1** | Decide shift-template role permissions and scope precedence | Clear authorization and discoverability before page implementation. |
| **12.2** | Build the shift-template list page and route | Make the existing table and hooks usable. |
| **12.3** | Add create/edit/duplicate form workflow | Complete the CRUD contract with typed validation. |
| **12.4** | Connect “use template” to shift creation with conflict feedback | Preserve downstream roster/shift invalidation and explain failures. |
| **12.5** | Migrate template table actions and form controls to local UI primitives | Standard keyboard, dialog, destructive-action, and responsive behaviour. |
| **12.6** | Add scenario coverage | Test empty/error/forbidden states, overnight calculations, break rules, duplicate names, scope filtering, and apply-template conflicts. |

## Audit evidence

| Source | Key observation |
 --- | --- |
| `features/availability/pages/AvailabilityDashboard.tsx` | Two-tab availability/leave dashboard with nested QueryClient and simulated hook dependencies. |
| `features/availability/hooks/useAvailability.ts` | Explicit mock/in-memory availability and leave-request data layer. |
| `features/availability/pages/EmployeeAvailabilityPage.tsx` | Real employee weekly editor with draft state, responsive grid/list, beforeunload protection, remote update detection, and forbidden handling. |
| `features/availability/hooks/useEmployeeAvailability.ts` | Real nested availability API, atomic weekly sync, DTO mapping, and employee-specific query cache updates. |
| `features/shift-templates/hooks/useShiftTemplates.ts` | Real template CRUD/apply transport and cache invalidation for rosters and shifts. |
| `features/shift-templates/components/ShiftTemplatesTable.tsx` | Orphaned responsive template table with raw Radix action/confirmation primitives. |
| `routes/AppRoutes.tsx` and `Components/layout/nav-items.ts` | Availability is company-admin-only; no shift-template route or navigation item exists. |

## References

[1]: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ "W3C WAI-ARIA Authoring Practices — Tabs Pattern"
[2]: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ "W3C WAI-ARIA Authoring Practices — Modal Dialog Pattern"
