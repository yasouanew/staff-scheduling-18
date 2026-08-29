# Task 6 and Task 7 Audit: Dashboards and Employees

**Project:** Rosterly staff-scheduling SaaS  
**Scope:** Existing dashboard and employee frontend surfaces. No application code was modified for this audit.  
**Audit date:** 17 August 2026

## Executive assessment

The application has distinct company-admin and scheduler dashboards, and the employee directory is a real API-backed company-admin workflow. The most important difference is data readiness: the **company-admin dashboard currently renders synthetic client-side analytics**, while the scheduler dashboard consumes roster data and the employee directory consumes real employee/branch API data.

The main visual issue remains design-system adoption. Neither dashboard nor employee files import the new local `@/Components/ui` primitives; instead they use common helpers and repeat raw buttons, inputs, selects, cards, dialogs, and feedback layouts. The next implementation stage should standardise those surfaces using the new primitives, remove nested feature-specific query clients, and replace synthetic analytics with tenant-scoped backend data before treating the company-admin dashboard as production-ready.

| Task | Current maturity | Primary finding | Recommended priority |
| --- | --- | --- | --- |
| **Task 6 — Dashboards** | Strong structural foundation, mixed data maturity | Company-admin metrics, charts, and activity are locally generated rather than API-backed | **Critical for data correctness** |
| **Task 7 — Employees** | Functional API-backed directory and invitation flow | Good core workflow, but no local UI adoption and filtering will not scale cleanly | **High** |

## Task 6 — Dashboards

### Current architecture and role coverage

The authenticated `/dashboard` route delegates to a role-specific dashboard. Company administrators receive `CompanyAdminDashboard`; schedulers receive `SchedulerDashboard`; super-administrators use a separate platform dashboard. This aligns with the current role-gated route structure and keeps the scheduler view focused on operational planning rather than company configuration.

| Dashboard | Intended role | Data source | Main content | Assessment |
| --- | --- | --- | --- | --- |
| `CompanyAdminDashboard` | Company administrator | `useDashboardAnalytics` | Labor cost, budget variance, scheduled hours, department allocation, recent activity | Presentation is mature, but data is synthetic. |
| `SchedulerDashboard` | Scheduler | `useRosters({ perPage: 5 })` | Recent rosters, published/draft totals, planned shifts, quick actions | Useful role-specific workflow starting point; data is API-backed through rosters. |
| Platform dashboard | Super administrator | Separate page and route | Platform/company/plan management | Outside this task’s detailed component audit. |

### Company-admin dashboard findings

The company-admin dashboard has a clear executive layout. It combines a responsive KPI grid, period toggle, two chart cards, and an activity panel. The responsive structure is appropriate: the KPI row progresses from one column to two and then four columns, while charts stack below `lg` and form a two-thirds/one-third layout at desktop size. The chart components expose loading, empty, error, retry, legend, and tooltip states; this is stronger state coverage than many feature pages.

However, `useDashboardAnalytics` builds the full analytic payload on the client and returns it through `Promise.resolve(buildDashboardAnalytics(period))`. Labor-cost values, department allocation, scheduled-hour series, and recent activity are therefore **not sourced from company data**. The chart components are useful as presentation contracts, but their current values must not be interpreted as authoritative operational or financial information.

| Finding | Evidence | Impact | Recommendation |
| --- | --- | --- | --- |
| Synthetic analytics | `useDashboardAnalytics` returns `Promise.resolve(buildDashboardAnalytics(period))` and does not call the API | Dashboard can appear credible while showing invented data; decisions may be made from incorrect metrics | Define tenant-scoped analytics endpoints and replace the builder with API DTO mapping. |
| Feature-scoped `QueryClient` | `CompanyAdminDashboard` creates and mounts its own `QueryClientProvider` despite an application-level provider | Cache and defaults can diverge from the rest of the app; invalidation and DevTools reasoning become harder | Remove feature-local providers and use the root query client. |
| No local UI primitive usage | Dashboard files import common helpers, not `@/Components/ui` | Dashboard remains visually separate from the new system | Migrate header, period toggle, cards, feedback, and retry actions to `PageHeader`, `Tabs` or a segmented-control primitive, `Card`, `Button`, and `ErrorState`. |
| Repeated inline feedback | Recent activity and chart cards each implement custom error/retry blocks | Retry copy and behaviour can drift | Use a standard contained-error component with retry support. |
| Activity timestamp fragility | `parseISO(item.timestamp)` is rendered directly | A malformed or incomplete future API timestamp can break the panel render | Normalise/validate timestamps in the analytics mapper and provide a safe fallback label. |

The period selector correctly uses `role="group"` and `aria-pressed`, which is a good accessible baseline for a two-option toggle. A future primitive should follow the established keyboard and state semantics for tabs or segmented controls rather than relying on independently styled buttons.[1]

### Scheduler dashboard findings

The scheduler dashboard has a practical workflow orientation. It foregrounds roster preparation, shift creation, leave review, recent roster status, and a clear explanation of the scheduler permission boundary. The responsive grid shifts from one column to two and then three KPI cards, with content panels stacking below desktop. This is a sensible fit for a scheduler who needs rapid navigation rather than executive reporting.

The dashboard is less complete in state management than the company-admin view. It handles a roster loading placeholder and an empty list, but it does not distinguish an unsuccessful roster request from a genuinely empty result. A transient network/API failure can currently look like “No roster periods are available yet.” It also repeats raw card, badge, link-button, and action-tile class strings.

| Finding | Impact | Recommendation |
| --- | --- | --- |
| Missing explicit error state for rosters | Failure and empty data can be confused | Add `isError`, a short recovery message, and a retry action. |
| Quick-action route validation needed | The dashboard links to `/shifts/create`; that route must exist or redirect to the supported shift-create flow | Confirm the route contract before release; use the relevant modal/roster creation path if no direct page exists. |
| No local design-system imports | The dashboard repeats page-header, card, badge, and button presentation patterns | Adopt `PageHeader`, `Card`, `Badge`, `Button`, and standard empty/error feedback. |
| Static access explanation | The permission note is helpful but can become stale as permissions evolve | Render permission-sensitive copy from a shared role capability model or keep it reviewed with access-control changes. |

### Dashboard design, responsive, and accessibility assessment

The dashboard files use semantic Tailwind colours rather than direct hexadecimal values, and no unsafe `any` markers or TODO markers were detected. Dashboard controls explicitly specify button type and include focus-visible styles. The company-admin dashboard includes meaningful loading/empty/error patterns across its visual modules.

The main accessibility opportunity is **consistency**, not an absence of basic attributes. Standard cards should use the common `Card` composition, period controls should use one approved segmented navigation/control pattern, and chart cards should expose concise text summaries where visual interpretation is essential. Chart legends alone should not be the only way to understand a metric for users of assistive technology.

### Task 6 recommendation order

| Step | Scope | Outcome |
| --- | --- | --- |
| **6.1** | Deliver real analytics API endpoints and tenant-safe DTOs | Company-admin metrics, activity, and charts become authoritative. |
| **6.2** | Remove dashboard-local `QueryClient` | One query/cache policy across the application. |
| **6.3** | Migrate dashboard layout to local UI primitives | Shared page headers, cards, actions, status chips, loading, error, and empty state language. |
| **6.4** | Add scheduler roster error/retry state | Do not present failed data loading as an empty roster. |
| **6.5** | Add accessible metric summaries and chart descriptions | Key analytic interpretation remains available without visual chart reading. |
| **6.6** | Add role-specific scenario tests | Verify admin/scheduler routing, failure, zero-data, and period changes. |

## Task 7 — Employees

### Current architecture and workflow

The employee surface is protected for the `company_admin` role. It consists of an API-backed directory (`EmployeeListPage`), an invitation/create drawer (`AddEmployeeModal`), `useEmployees` transport/mapping hooks, branch option retrieval, and a separate availability route per employee. The feature performs `GET /employees`, `POST /employees`, and `GET /employees/{id}` requests; successful creation invalidates the employee query-key family.

| Area | Current behaviour | Assessment |
| --- | --- | --- |
| Directory | KPI cards, search, branch/department filters, responsive TanStack table | Functional and thoughtfully structured. |
| Invitation | Side drawer with Zod validation, branch selection, success/error toasts | Good core create flow; presentation is still duplicated/legacy. |
| Data layer | API DTO mapping, query keys, mutation invalidation | Strong foundation for real operational data. |
| Availability | Per-employee route link from table | Useful operational handoff. |
| Role scope | Company-admin route group only | Matches the intended management boundary. |

### Strengths

The directory provides several strong baseline behaviours. It includes a KPI summary, employee search, branch and department filters, a clear active-branch context with a reset action, visible API loading/error handling, and a data table with progressively hidden columns at smaller breakpoints. On mobile, the employee name and email remain visible while lower-priority position, department, branch, and joined-date columns are hidden. The row action has a specific accessible label: “Manage weekly availability for [employee name].”

The API hook is well aligned with the product architecture: list and detail operations have distinct query keys, employee creation is a mutation, and successful creation invalidates all employee queries. The add form labels inputs, supplies autocomplete where relevant, uses Zod validation, resets when reopened, and displays an explicit branch prerequisite when no branches exist.

### Employee directory and invitation findings

| Finding | Evidence | Impact | Recommendation |
| --- | --- | --- | --- |
| Feature-local `QueryClient` | `EmployeeListPage` mounts a new provider and client | Bypasses application-wide cache/defaults and adds unnecessary provider nesting | Use the root query client. |
| Partial server-side filtering | Branch filter is sent to the API; search and department filter run against loaded client rows | Directory does not scale predictably across large or paginated organisations | Move search, department, status, sort, and pagination into an explicit server-supported list contract. |
| No visible pagination contract | The page passes a filtered array to `DataTable` without a visible server-page model | Users may only search the currently loaded page of a larger workforce | Show result count and pagination; preserve filters in query parameters if supported. |
| Raw control duplication | Search input, selects, buttons, drawer, fields, and error panel are manually styled | Page does not benefit from the approved design system | Use `SearchInput`, `Select`, `Button`, `Dialog`, `Field`, `Input`, `ErrorState`, `Avatar`, and `PageHeader`. |
| Drawer uses raw Radix dialog | `AddEmployeeModal` imports and styles its own dialog structure | Dialog behaviour and sizing may drift from the shared shell/dialog policy | Migrate to the local dialog/sheet primitive; retain form and mutation logic. |
| Validation errors not programmatically linked | Add-employee fields set `aria-invalid` but error paragraphs do not have IDs referenced by `aria-describedby` | Assistive technology receives less contextual form error detail | Use `FieldError` to connect label, input, description, and error IDs. |
| `z.enum` tuple cast is brittle | Department values use `as unknown as [...]` | Domain-option changes can be hidden from type checking | Export a non-empty tuple/enum-compatible constant from the domain types. |
| Limited management actions exposed | Current UI offers create and availability only | Company administrators cannot see an employee profile, edit details, change lifecycle status, resend invitations, or act on pending invites from this surface | Confirm API capability, then add explicit row/detail actions in a later employee-management phase. |

### Data-state, accessibility, and responsive assessment

The employee feature has good basic accessibility signals: no image was found without an `alt` attribute, no button was found without an explicit type, and focus-visible/ARIA state markers are present. The avatar intentionally uses an empty `alt` because the employee name sits immediately beside it, avoiding redundant speech output. The table’s responsive column hiding is appropriate for a first mobile pass.

The remaining mobile concern is interaction density. The table keeps the status and availability action visible, but action controls can still crowd narrow devices. The next implementation should visually test the table at 320 px, 375 px, 768 px, and desktop widths; retain the responsive hide rules, but consider a compact employee card/list presentation below `sm` if the action column becomes difficult to use.

The employee page is API-backed, unlike the company-admin dashboard. This should be preserved: do not replace its hooks with local mock state during the design migration.

### Task 7 recommendation order

| Step | Scope | Outcome |
| --- | --- | --- |
| **7.1** | Remove employee-local `QueryClient` | Use the application query cache and standard retry/refetch policy. |
| **7.2** | Migrate directory and drawer to local UI primitives | One coherent header, filter, form, drawer, feedback, badge, and avatar experience. |
| **7.3** | Make all directory filters and pagination server-aware | Accurate employee search/filter results at any company size. |
| **7.4** | Link field errors semantically | Screen-reader users receive complete validation context. |
| **7.5** | Add employee profile/lifecycle actions after API review | Complete the company-admin employee-management workflow without inventing unsupported operations. |
| **7.6** | Verify table/card experience at target breakpoints | Ensure search, filters, status, and availability remain practical on narrow mobile screens. |
| **7.7** | Add mutation and filter scenario tests | Cover duplicate emails, branchless companies, API errors, invitation success, filter reset, and cache refresh. |

## Audit evidence

| Source | Key observation |
| --- | --- |
| `features/dashboard/pages/CompanyAdminDashboard.tsx` | Responsive KPI/chart/activity composition, local `QueryClient`, common helpers, and manually generated analytics view. |
| `features/dashboard/hooks/useDashboardAnalytics.ts` | Entire analytics payload is synthesised client-side through `buildDashboardAnalytics`. |
| `features/dashboard/pages/SchedulerDashboard.tsx` | API-backed roster summary, quick actions, responsive layout, but no explicit roster error state. |
| `features/dashboard/components/*Chart.tsx` | Chart-level loading, empty, error, retry, legend, and tooltip handling. |
| `features/employees/pages/EmployeeListPage.tsx` | API-backed directory, responsive columns, KPI cards, client-side search/department filtering, local `QueryClient`. |
| `features/employees/components/AddEmployeeModal.tsx` | Zod-backed invitation drawer, branch prerequisite message, raw dialog/control styling. |
| `features/employees/hooks/useEmployees.ts` | GET/POST/detail transport, query keys, DTO mapping, and cache invalidation after creation. |
| `routes/AppRoutes.tsx` | Employee pages are guarded by the company-admin role route group. |

## References

[1]: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ "W3C WAI-ARIA Authoring Practices — Tabs Pattern"
