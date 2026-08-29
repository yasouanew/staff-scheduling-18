# Task 19 — Final UI/UX Audit

**Project:** Rosterly staff-scheduling SaaS  
**Scope:** Complete React/TypeScript frontend and the findings from Tasks 1–18.  
**Audit date:** 17 August 2026  
**Code changes:** None. This document is an audit only.

## Executive verdict

Rosterly has a credible frontend foundation: the application has role-aware route groups, a responsive authenticated shell, a local Tailwind/shadcn-style primitive layer, real API-backed workflows for many operational features, Laravel Echo notification support, and strong domain coverage across rosters, shifts, leave, employees, branches, departments, positions, billing, and onboarding.

The frontend is **not yet production-consistent as one product** because its strongest implementation patterns are not the patterns used everywhere. Several important surfaces remain prototypes, mock-backed, disconnected, or duplicated. The most consequential examples are the mock analytics dashboards, mock availability dashboard, mock roster calendar, mock Settings page, missing active Profile route, and absent user-facing Shift Templates workflow. These are not primarily visual defects; they are source-of-truth and workflow defects that can make a polished interface communicate data that is not authoritative.

> **Final assessment:** The product is suitable for a focused integration and hardening phase, but not for a broad “UI polish only” release. The next work should establish authoritative data flows and one consistent workspace model before migrating every feature to visual primitives.

| Dimension | Assessment | Severity |
| --- | --- | --- |
| Frontend architecture | Active React Router SPA is clear, but legacy Inertia components and several feature-local query clients remain | High |
| Design system | Strong local foundation exists, but adoption is incomplete across most feature pages | High |
| Primary roster workflow | Domain-rich but split between real API management and mock calendar interaction | Critical |
| Data truthfulness | Several dashboards/settings/availability surfaces use mock or synthetic values | Critical |
| Role and access UX | Route grouping is deliberate, but capability logic is duplicated and frontend-only assumptions remain | High |
| Responsive UX | Shell is thoughtfully breakpoint-aware; dense tables, settings navigation, and calendar surfaces need deeper mobile treatment | High |
| Accessibility | Labels, focus styles, dialog primitives, and alert roles are present in many newer screens; error association and status announcements are inconsistent | High |
| Operational scalability | Many features request `perPage: 100`; some pages create local `QueryClient` instances; URL filter/pagination state is inconsistent | High |
| Release readiness | Requires an integration hardening phase before final release | Critical |

## 1. Frontend architecture

The active product is a React 18/TypeScript SPA using Vite, React Router, TanStack Query, React Hook Form, Zod, Tailwind CSS, Radix UI, Lucide React, Sonner, date-fns, FullCalendar, Axios, Laravel Echo, and local shadcn-style primitives. The application entry point provides routing, query state, authentication/session context, and the global theme layer. The authenticated shell owns the sidebar, responsive mobile navigation, header, breadcrumbs, theme switcher, profile menu, trial state, and notification bell.

The feature-oriented directory structure is understandable and maps well to the business domain. Pages generally own screen orchestration, hooks own transport and cache invalidation, schemas own form validation, and components own form/table/dialog presentation. This is a useful boundary and should be retained.

The main architectural issue is **parallel generations of frontend patterns**. New local UI primitives exist, while many feature pages still use raw HTML controls and repeated Tailwind strings. The active SPA also contains legacy Inertia-era components under `resources/js/Pages` and `resources/js/Components`, including a profile form that is not connected to the active router. In addition, dashboard and employee surfaces were found to create feature-local query clients, which can fragment caching and retry policy away from the application provider.

| Architectural finding | Consequence | Priority |
| --- | --- | --- |
| Local design system and raw feature controls coexist | Visual and accessibility drift continues | P1 |
| Legacy Inertia component tree remains beside active SPA | Ownership and routing are ambiguous, especially for Profile | P0 |
| Some feature pages create local `QueryClient` instances | Cache invalidation, retries, and realtime updates can diverge | P1 |
| Filters and tabs are often local component state | Deep links, browser history, and shareable workspaces are weakened | P1 |
| Real API pages and mock pages look structurally similar | Users cannot distinguish authoritative from demonstration data | P0 |

## 2. Product truth and workflow readiness

### Critical product-truth boundary

The most important final-audit finding is that the frontend contains a mixture of real workflows and presentational prototypes. The following surfaces require explicit product decisions before visual polishing is considered complete:

| Surface | Current truth status | Required action |
 --- | --- | --- |
| Company-admin dashboard analytics | Synthetic/mock values and local query ownership were identified | Add tenant-scoped analytics endpoints and authoritative DTOs. |
| Scheduler dashboard | Roster-oriented but incomplete error/empty handling | Add real data-state handling and connect to the canonical roster workspace. |
| Availability dashboard | Mock employees and in-memory availability/leave layer | Replace with real employee availability and approved leave data. |
| Employee availability editor | Real API-backed persistence and conflict handling | Keep as the source for employee self-service; integrate with roster. |
| Roster calendar | Rich interaction but mock-backed calendar layer | Replace its data source with the real roster/shift contract. |
| Roster list/detail | Real API-backed management foundation | Make this the canonical roster workspace model. |
| Shift management | Real API-backed CRUD, assignment, timezone hint, required staff | Integrate into the canonical roster workspace and add server conflict authority. |
| Leave requests | Real submission, approval/rejection, allowance, attachments, and invalidation | Surface approved leave and pending coverage risk directly in roster. |
| Shift Templates | Hook/table support exists, but no complete route and CRUD workflow | Decide scope and expose a real management workflow before claiming completion. |
| Settings | Mock organisation, branch, and policy data with simulated saves | Replace with API-backed persistence or clearly label as prototype. |
| Profile | Header path exists, active SPA route does not | Implement the profile route or remove the broken link. |

## 3. Design-system consistency

The design-system foundation is a meaningful strength. Semantic Tailwind tokens, light/dark/system theme activation, local Button, Input, Field, Textarea, Select, Checkbox, Switch, Card, Badge, Dialog, AlertDialog, DropdownMenu, Table, feedback, Popover, Calendar, DatePicker, Avatar, Tooltip, Tabs, SearchInput, Pagination, and ThemeToggle primitives are available. The shell has already adopted several of them.

The adoption gap is substantial. Many feature surfaces still contain direct `<button>`, `<input>`, `<select>`, and `<textarea>` implementations, repeated `fieldClasses`, repeated button class strings, manually styled dialogs, and local loading/error/empty blocks. This means adding a primitive does not yet change the product’s visual or accessibility consistency.

| Primitive or pattern | Current state | Final recommendation |
 --- | --- | --- |
 | Button | Local primitive exists; many feature pages still use raw buttons | Migrate high-risk actions first: save, delete, approve, reject, assign, publish. |
 | Form fields | Local Field/Input/Select/Textarea exist; feature forms repeat labels and errors | Create one field contract with `aria-describedby`, error, hint, and pending state. |
 | Dialogs | Radix/local primitives exist; some pages still style dialogs directly | Standardise close, title, description, footer, focus, and destructive confirmation. |
 | Tables | Responsive local table exists; feature tables often implement their own | Add mobile card/column strategy and shared pagination/search contracts. |
 | Feedback | Loading/empty/error primitives exist; pages still create local blocks | Standardise retry, empty explanation, and `aria-busy`/status announcements. |
 | Badges/status | Local semantic Badge exists; feature status styling varies | Use a typed status registry with consistent label and tone. |
 | Calendar/date picker | Local date picker exists; many forms use native date inputs | Adopt shared date handling where range, timezone, and partial-day semantics matter. |
 | Theme | Global provider and switcher exist | Keep semantic tokens; audit legacy gray/indigo classes before removing dark mode. |

## 4. Responsive and interaction audit

The authenticated shell is the most coherent responsive area. It uses a desktop sidebar, tablet icon rail, compact mobile header, and extracted mobile drawer. However, feature surfaces need task-specific responsive behaviour rather than simply adding smaller widths.

Dense management tables for employees, branches, departments, positions, shifts, and leave are often desktop-first. Many request up to 100 rows and rely on horizontal scrolling or compressed columns. A mobile scheduling product should use a deliberate strategy: priority columns, row-to-card transformation, employee/shift detail drawers, or a mobile agenda mode.

The roster calendar requires a workspace-specific responsive design. A full week-by-employee grid is not a smaller desktop grid. On mobile it should become an agenda/day mode with employee and shift context, persistent filter access, open-shift visibility, conflict messaging, and a clear date navigator.

Settings has a fixed-width vertical sidebar inside a flex layout, which can consume most of a narrow viewport. It needs URL-addressable tabs rendered as a mobile select, horizontal list, or drawer. Profile and notification menus should remain reachable in the compact header without relying on hover.

| Responsive risk | User impact | Recommendation |
 --- | --- | --- |
| Desktop tables with 100-row payloads | Slow, crowded, or incomplete mobile lists | Add server pagination and mobile card/priority-column modes. |
| FullCalendar/week grid on small screens | Staffing situation becomes unreadable | Add mobile agenda/day mode rather than shrinking the grid. |
| Fixed settings sidebar | Content can become too narrow or overflow | Use responsive tabs/select and URL state. |
| Filter rows with many native selects | Important filters wrap awkwardly | Use a filter toolbar with collapsible mobile panel and applied-filter summary. |
| Modal/drawer forms with long content | Keyboard and scroll context can be difficult | Use standard dialog/drawer focus management and sticky action footer. |

## 5. Accessibility audit

The application has several good accessibility practices: explicit labels, `aria-invalid` usage in newer forms, focus-visible rings, semantic `role="alert"` conflict messages, Radix dialog/menu primitives, button `type` declarations, and accessible icon hiding. The local design-system layer provides the right foundation for further improvement.

The highest recurring issue is **incomplete error association**. An input may be marked invalid while its visible message is not consistently connected with `aria-describedby`. Error text, loading state, toast feedback, and mutation pending state are also not consistently announced or scoped to the action that caused them. This is especially relevant in shift assignment, leave submission, approval/rejection, employee invitation, and settings saves.

Charts and dashboard metrics require non-visual summaries. Calendar grids need keyboard and screen-reader semantics that communicate employee, date, shift, assignment, required staffing, conflict, and leave-block context. Colour-coded departments, statuses, and schedule states must not rely on colour alone. The user-configurable department colour feature should use an accessible semantic palette or validate contrast against both themes.

| Accessibility area | Current condition | Required hardening |
 --- | --- | --- |
 | Form labels | Generally present in newer forms | Link label, hint, error, and input through one shared Field primitive. |
 | Error messages | Visible and often `aria-invalid`; association inconsistent | Add stable IDs and `aria-describedby`; announce server errors. |
 | Status messages | Toasts and alerts exist | Add local live-region/status semantics for important asynchronous outcomes. |
 | Dialogs | Radix/local foundations exist | Remove remaining custom dialog implementations and test focus return. |
 | Tables | Headers and overflow vary by feature | Add captions, scope, responsive strategy, and row-action labels. |
 | Calendar | Rich but mixed implementation quality | Define keyboard navigation, accessible event names, and non-colour state labels. |
 | Charts | Dashboard metrics need visual alternatives | Provide text summaries and data tables for significant analytics. |
 | Colour | Semantic tokens exist but legacy/user colours remain | Validate contrast and never use colour as the only status signal. |

## 6. Role, tenant, and security UX

Role-filtered navigation and route groups are deliberate strengths. Super-admin, company-admin, scheduler, and employee behaviour are separated in the current application structure, with employee web access intentionally constrained. Billing lock/unlock and subscription activation are also represented in the shell.

The risk is duplicated capability inference. Some feature hooks combine permission checks with hardcoded role-name fallbacks, while route visibility and backend enforcement are separate concerns. This can result in a control being visible but rejected, hidden while still technically allowed, or rendered under stale session state. The frontend must remain an ergonomic layer, not the authorization authority; the backend must enforce company tenant scope and action permissions.

| Role/access risk | Recommendation |
 --- | --- |
 | Permission and role-name checks are duplicated | Return a typed capability matrix in the session resource and use shared predicates. |
 | Frontend route guards can be mistaken for security | Preserve backend authorization and tenant scoping for every mutation/query. |
 | Locked-company exceptions are easy to regress | Keep billing, activation, logout, and session routes explicitly outside operational lock gates. |
 | Profile/settings ownership is unclear | Separate account profile, company settings, and platform settings contracts. |
 | Employee web/mobile boundary is implicit in places | Make the intended redirect and messaging explicit and test it. |

## 7. Performance and maintainability

A repeated operational pattern is loading up to 100 records for employees, positions, branches, rosters, shifts, and leave requests. This is convenient for form options but will not scale to large tenants. The API already supports pagination and filtering in several hooks; the frontend should use server-backed search, dependent option loading, and query parameters rather than loading whole collections.

Several earlier audits identified feature-local `QueryClient` instances in dashboard and employee surfaces. These should be removed in favour of the application provider so query invalidation, retries, stale times, and realtime updates remain coherent. The notification hook’s cache keys are comparatively strong and should become the model for other feature hooks.

Legacy Inertia dependencies and components should be retired or isolated once the profile path and any remaining pages are migrated. Unnecessary or overlapping packages should be reviewed only after import usage is measured; the principle should be to remove duplicate UI/runtime stacks, not to remove a dependency simply because it is present.

| Maintainability concern | Action |
 --- | --- |
| Local query clients | Use one app-level TanStack Query client. |
| `perPage: 100` patterns | Replace with pagination, server search, and dependent queries. |
| Feature-local status/error markup | Migrate to shared typed primitives. |
| Legacy Inertia tree | Migrate active account/profile flows, then remove unused paths and dependencies. |
| Mock data in production routes | Mark demos clearly or replace with API-backed state before release. |
| URL state gaps | Persist filters, tabs, week, status, and pagination in route/search params. |
| Duplicate domain models | Establish canonical roster, shift, leave, employee, and settings DTO mappings. |

## 8. Severity-ranked final backlog

### P0 — Release blockers

| Item | Why it blocks release |
 --- | --- |
 | Establish authoritative data for dashboards, availability dashboard, roster calendar, and settings | Users must not make staffing or configuration decisions from mock/synthetic data. |
 | Make the roster one real workspace | The primary product cannot depend on a mock calendar disconnected from real shifts. |
 | Implement or remove the broken Profile link | A visible shell action must not lead to an unregistered route. |
 | Define Settings and Shift Templates completion status | Navigation should not promise workflows that are prototypes or absent. |
 | Verify backend authorization/tenant scope for every operational mutation | Frontend visibility is not a security boundary. |

### P1 — Required hardening

| Item | Why it matters |
 --- | --- |
 | Migrate high-impact features to local UI primitives | Consistency and accessibility need to be systemic, not aspirational. |
 | Add server-authoritative scheduling conflict validation | Client warnings can be bypassed or become stale. |
 | Integrate leave/availability into roster staffing risk | Schedulers need one view of coverage constraints. |
 | Remove local query clients and standardise query keys | Prevent stale data and inconsistent cache behaviour. |
 | Add responsive table and calendar modes | Mobile and tablet users need task-appropriate interactions. |
 | Consolidate capability/session contracts | Avoid role/permission drift. |
 | Add semantic error/status association | Make failures and asynchronous outcomes perceivable. |

### P2 — Product polish and scale

| Item | Why it matters |
 --- | --- |
 | Add notification preferences and typed notification registry | Users need controllable, actionable communication. |
 | Add URL state for filters/tabs/week/pagination | Workspaces become shareable and recoverable. |
 | Add chart data alternatives and richer empty states | Improve interpretation and accessibility. |
 | Retire legacy visual/runtime patterns | Reduce maintenance cost after active flows migrate. |
 | Add scenario and responsive tests | Protect role, data, and breakpoint contracts during migration. |

## 9. Recommended implementation sequence

The safest sequence is not “refactor every page at once.” It is a dependency-aware release sequence.

| Phase | Workstream | Exit condition |
 --- | --- | --- |
 | **A. Truth boundary** | Replace mock dashboards, availability dashboard, roster calendar data, and settings persistence; define Shift Templates and Profile scope | All visible operational screens use explicit authoritative or clearly labelled demo data. |
 | **B. Canonical roster** | Build one week-scoped workspace with real shifts, employees, branch/department/employee filters, open shifts, leave/availability blocks, conflict results, and publish state | A scheduler can understand and act on staffing status from one source of truth. |
 | **C. Account/configuration** | Implement active SPA Profile; replace Settings mocks; separate account, company, and platform settings | Header links and configuration surfaces are real, permission-aware, and persistent. |
 | **D. Shared primitive migration** | Migrate forms, tables, dialogs, buttons, statuses, feedback, dates, filters, and menus in the highest-traffic operational features | Feature pages consume the same semantic UI contracts. |
 | **E. Scale and state** | Replace 100-row loads, remove local query clients, add URL state, server search, pagination, and dependent option loading | Large tenants receive complete, predictable, performant lists. |
 | **F. Accessibility and testing** | Add keyboard, screen-reader, error/status, theme, responsive, role, and mutation scenario coverage | Release checks protect interaction and permission contracts. |

## 10. Final quality gates

Before production release, the project should pass the following gates:

| Gate | Required verification |
 --- | --- |
 | Build | `npm run build` succeeds with no TypeScript errors. |
 | Source quality | No unsafe `any`, unresolved TODO/mock markers on claimed production routes, direct colour violations, or whitespace errors. |
 | Data truth | Every visible operational metric and control is API-backed or explicitly labelled as demo. |
 | Tenant safety | Cross-company data cannot appear through list, detail, mutation, or realtime paths. |
 | Role matrix | Super-admin, company-admin, scheduler, and employee scenarios are tested against both route visibility and API response. |
 | Responsive | Desktop, tablet, mobile shell; roster agenda/day mode; dense table strategy; settings/profile; dialogs and drawers. |
 | Accessibility | Keyboard-only navigation, focus return, labels, error association, live status, non-colour state, reduced motion, and contrast. |
 | Theme | Light, dark, and system preferences render semantic surfaces and user-configurable status colours legibly. |
 | Async state | Loading, empty, error, retry, optimistic/pending, success, and stale-data states are explicit. |
 | Integration | Stripe lifecycle, notification delivery, leave approval, roster publish, conflict rejection, and subscription lock/unlock scenarios. |

## Conclusion

Rosterly has enough foundation to become a strong scheduling SaaS product, but the final UI/UX challenge is now **consistency of truth and workflow**, not the addition of more decorative components. The local design system and authenticated shell are ready to support the next phase. The product should first make the roster, settings, dashboards, availability, and profile surfaces authoritative and connected; then migrate high-traffic operational pages onto the shared primitives; then harden scale, accessibility, and responsive behaviour.

The strongest near-term product outcome is a scheduler who can open one weekly roster, immediately see assigned versus required staffing, open shifts, employee availability, approved leave, conflicts, branch/department filters, and publish status, then act safely without switching between mock and real surfaces. That should remain the acceptance criterion for the next implementation phase.

## References

[1]: https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html "W3C WCAG 2.2 — Error Identification"
[2]: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html "W3C WCAG 2.2 — Status Messages"
[3]: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ "W3C WAI-ARIA Authoring Practices — Modal Dialog Pattern"
[4]: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ "W3C WAI-ARIA Authoring Practices — Tabs Pattern"
