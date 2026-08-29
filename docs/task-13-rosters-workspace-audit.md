# Task 13 Audit: Roster Scheduling Workspace

**Project:** Rosterly staff-scheduling SaaS  
**Scope:** Existing roster implementation assessed as a professional weekly scheduling workspace. No application code was modified for this audit.  
**Audit date:** 17 August 2026

## Executive assessment

The roster feature has useful interaction building blocks—FullCalendar, event drag/drop and resize, quick shift creation/editing, conflict warnings, real roster-week CRUD, copy-previous-week, publish, and read-only weekly summaries. However, the implementation is currently split between **two incompatible roster models**:

1. The `/rosters`, `/rosters/:id`, and roster-management hooks are real API-backed roster-week records with branch, status, publish, copy-week, and open-shift data.
2. The `/rosters/calendar` “Master Roster” is a separate mock shift calendar backed by an in-memory `useRoster` hook with hardcoded employees, departments, wage rates, availability windows, and shifts.

This split is the most important Task 13 finding. The visual calendar looks like the primary product surface, but it does not edit the same roster record that the real roster list and detail pages expose. It also omits several requirements in the brief: branch, department, employee, and publish-status filters; reliable unassigned-shift creation; authoritative conflict detection; and an immediate staffing-situation summary across a selected week.

> **Conclusion:** The roster should be refactored as one week-scoped, tenant-backed scheduling workspace. The current calendar is a useful interaction prototype, but it should not remain a parallel source of scheduling truth.

| Requirement | Current state | Assessment |
| --- | --- | --- |
| Weekly schedule | FullCalendar has a week view; real roster detail has a read-only seven-day grid | Present, but split across data models and not tied to a selected real roster week in the calendar. |
| Employee visibility | Calendar event cards show assigned employee names; detail grid shows names | No employee lanes, employee filter, staffing matrix, or unassigned-first view. |
| Shift visibility | Drag/resize calendar and read-only week cards | Strong prototype interaction; authoritative shift editing is missing from the real roster record. |
| Drag/drop | Supported in FullCalendar with revert-on-error behaviour | Good interaction foundation, but currently operates on mock shifts. |
| Quick shift creation/editing | `QuickShiftModal` supports create/edit/delete | Requires an employee and is disconnected from real roster context; cannot create open shifts. |
| Conflicts | Checks hardcoded approved leave/unavailability windows | Does not cover real availability, overlapping shifts, staffing coverage, or backend conflicts. |
| Unassigned shifts | Real roster detail can count open shifts; calendar quick-create cannot create them | Requirement is only partially represented. |
| Filters | Real roster list has status/branch filters | Calendar has no branch, department, employee, or publish-status filters. |
| Publish status | Real detail can publish a draft roster | Calendar has no roster identity or publish-state context. |
| At-a-glance staffing | KPI cards show hours, cost, and shift count | Does not show coverage gaps, unassigned shifts, conflicts, or staffing by employee/day. |

## Current architecture

### Real roster-management flow

The real roster data layer maps backend roster and shift DTOs into stable domain objects. It supports list/detail/create/update/delete, publish, and copy-previous-week operations. List parameters include status, branch, week start, and week end. The real detail page presents a selected roster week, status, branch, published metadata, KPI counters, open shifts, and a read-only weekly grid.

The real list page is conventional management CRUD: KPI cards, branch/status filters, a table, roster form drawer, copy-previous-week dialog, and row actions. It is useful administration infrastructure, but it is not yet the primary scheduling workspace requested in Task 13.

### Mock calendar flow

`RosterCalendarPage` creates a feature-local QueryClient and calls `useShifts` from `features/rosters/hooks/useRoster.ts`. That hook explicitly describes itself as a mock/network-simulation layer. It stores shifts in memory, seeds the current week from the browser date, hardcodes four employees and three departments, and supplies hardcoded availability windows for conflict detection.

FullCalendar renders these mock shifts with time-grid and list-week responsive views. Event click opens `QuickShiftModal`; drag and resize call the mock update mutation; conflicts are checked before persistence and the calendar event can be reverted. This is a good interaction prototype, but the calendar does not receive a roster ID, selected branch, selected week, or real roster shifts.

| Surface | Data owner | Editing | Publish context | Primary limitation |
| --- | --- | --- | --- | --- |
| `/rosters` | `useRosters` real API | Create/edit/delete/copy | Status shown | Conventional list, not staffing workspace. |
| `/rosters/:id` | `useRosters` real API | Roster edit/publish/delete; read-only grid | Present | No drag/drop or quick shift editing. |
| `/rosters/calendar` | `useRoster` mock layer | Drag/drop/resize/quick create/edit/delete | Absent | Not connected to the real roster-week model. |

## Weekly staffing visibility assessment

A scheduler should understand staffing status within seconds. The current calendar communicates **when shifts exist**, but not whether the week is adequately staffed. Its metrics are total roster hours, estimated labour cost, and active shift count. It does not show the number of unassigned shifts, days with coverage gaps, employees over their availability, employees double-booked, required staff versus assigned staff, or the number of conflicts requiring attention.

The real roster detail page does calculate open shifts, employee count, shift count, and payable hours. That information should become part of the primary workspace header and should remain visible while the scheduler navigates the week. The weekly surface should make the following states immediately scannable:

| Staffing signal | Recommended presentation |
 --- | --- |
| Unassigned/open shifts | Persistent warning count with direct filter to open shifts. |
| Availability conflicts | Critical count plus highlighted shift cards and a conflict panel. |
| Coverage gaps | Day/department coverage indicator comparing required staff with assigned staff. |
| Employee workload | Employee-lane totals with optional hours and shift counts. |
| Publish state | Draft/published badge in the workspace header with publish action and confirmation. |
| Branch scope | Current branch selector and visible “All branches” state. |
| Department distribution | Filter chips or summary counts by department. |
| Week context | Previous/next week controls, “Today/current week”, and a clear week range. |

## Interaction findings

### Drag/drop and resize

FullCalendar is already configured with interaction and time-grid plugins, event drop, event resize, `nowIndicator`, and revert-on-error behaviour. This should be retained as an interaction layer, but the mutation must target the selected real roster and real shift. The current conflict check only compares the proposed shift to hardcoded leave/unavailability windows; it does not ask the server to validate overlapping shifts, branch/department constraints, or required staffing.

A production interaction should optimistically move the event only when the server accepts the update, or revert it with a structured error response that identifies the conflict type. The UI should not rely on a toast alone for a scheduling conflict that may require a decision; the affected shift card and conflict summary should remain visibly marked.

### Quick creation and editing

`QuickShiftModal` is a useful fast-entry pattern, but it requires both an employee and department. That prevents the scheduler from creating an open shift and assigning it later, despite the real roster model representing open shifts. The modal also uses hardcoded employee and department options from the mock hook, has no branch or selected-roster context, and does not connect to shift-template application.

The correct quick-create contract should inherit week, date, branch, department, and roster context from the workspace. Employee should be optional. A shift created without an employee must remain visibly open and appear in the workspace’s unassigned filter.

### Filters

The real roster list supports status and branch filters, but the calendar has no filter bar. The primary workspace needs filters for branch, department, employee, shift status, publish state, and conflict/unassigned state. Filters should be URL-addressable or otherwise restorable when navigating into a shift editor so that a scheduler does not lose context.

The employee filter should support “All employees”, individual employees, and “Unassigned”. The conflict filter should support “All”, “Conflicts only”, and “No conflicts”. Department and branch filters must be sourced from the tenant API, not duplicated constants.

## Accessibility, responsive behaviour, and design-system findings

The calendar provides a responsive `listWeek` mode below the mobile breakpoint and has accessible event text through the custom event card. The real detail grid stacks seven day columns into a vertical agenda on smaller screens. Buttons include explicit types and focus-visible classes are present across the workspace.

The remaining issue is usability rather than animation. FullCalendar’s dense time grid can become difficult to operate on narrow screens, and a scheduler needs the date, employee, role, assignment, and conflict state to remain readable in the mobile agenda. The mobile surface should prioritise a filterable day agenda over tiny draggable blocks.

None of the roster feature files imports the new local `@/Components/ui` primitives. Six files use common helpers and five use raw Radix primitives. Page headers, metric cards, buttons, dialogs, confirmation flows, event states, and feedback are therefore visually implemented in parallel with the approved design system. A roster workspace should use the local primitives for the surrounding chrome while preserving FullCalendar as the specialised scheduling canvas.

| Finding | Impact | Recommendation |
 --- | --- | --- |
| Feature-local QueryClient | Cache policy can diverge and real/mocked queries are harder to reason about | Use the root QueryClient once the real workspace data layer is consolidated. |
| Mock and real data coexist | A visually compelling calendar can give false confidence about production readiness | Remove the mock scheduling source from the production route. |
| No local UI imports | Shell and workspace controls drift from the approved system | Migrate header, filters, metrics, buttons, dialogs, badges, and feedback to local UI primitives. |
| Custom detail breadcrumb | It can diverge from the shared shell breadcrumb | Use the shared breadcrumb component. |
| Dense calendar controls | Small screens may prioritise visual density over task completion | Keep list/day agenda mobile-first; avoid forcing drag interactions on touch screens. |
| Colour is not sufficient for state | Shift themes and borders alone may not convey conflict/open/published status | Add text, icons, labels, and accessible summaries for every critical state. |

## Role and permission observations

The roster navigation is available to `company_admin` and `scheduler`, and the route group reflects that. This is appropriate for the primary workspace. The current calendar and real roster detail should share the same role model and capability checks. Company administrators may publish and manage roster configuration, while schedulers may need create/edit/assign rights but not necessarily delete or publish rights. The UI should not infer these capabilities from route visibility alone; it should consume the server-authoritative permissions already available in the session model.

## Recommended workspace architecture

The product should converge on one roster workspace organized around a real roster-week record.

| Workspace region | Recommended responsibility |
 --- | --- |
| Workspace header | Week navigation, branch scope, roster status, publish action, save/sync state, and high-level staffing warnings. |
| Filter rail/toolbar | Branch, department, employee, open/unassigned, conflict, and publish-status filters. |
| Staffing summary | Total shifts, assigned/open shifts, conflicts, coverage gaps, employees scheduled, and payable hours. |
| Main schedule | Employee-lane week grid or day/employee matrix, with draggable shifts and visible unassigned lane. |
| Shift card | Time, role/position, employee, department, branch, status, conflict indicator, and quick actions. |
| Secondary attention panel | Conflicts, unassigned shifts, coverage gaps, and approved leave blocks. |
| Quick-create interaction | Contextual date/time/branch/department defaults; optional employee; template selection; immediate validation. |
| Mobile mode | Filterable day agenda with large cards, clear assignment state, and bottom-sheet editing; drag/drop should be optional rather than mandatory. |

## Recommended implementation order

| Priority | Work | Outcome |
 --- | --- | --- |
| **13.1** | Choose the real roster-week record as the calendar’s data source | Eliminate the mock/real split and make every edit belong to a roster. |
| **13.2** | Add workspace week navigation and branch scope | Give the scheduler a stable weekly context. |
| **13.3** | Add server-backed filters for branch, department, employee, status, conflict, and unassigned | Let users isolate the staffing problem they need to solve. |
| **13.4** | Make quick-create employee optional and context-aware | Support open shifts and fast scheduling from the current cell/date. |
| **13.5** | Move conflict detection to authoritative availability and shift validation | Cover leave, availability, double booking, and staffing constraints. |
| **13.6** | Add coverage and attention summaries | Make staffing risk visible within seconds. |
| **13.7** | Connect drag/drop and resize to real shift mutations | Preserve the existing interaction while making it production-safe. |
| **13.8** | Converge real detail and calendar into one workspace | Avoid separate read-only and editable roster experiences. |
| **13.9** | Migrate shell controls to local UI primitives | Standardise filters, buttons, dialogs, badges, and feedback. |
| **13.10** | Add scenario and interaction tests | Cover week changes, filters, touch/mobile agenda, conflicts, open shifts, publish transitions, and permission differences. |

## Audit evidence

| Source | Key observation |
 --- | --- |
| `features/rosters/pages/RosterCalendarPage.tsx` | FullCalendar week/day/month surface with drag/drop, resize, quick modal, leave blocks, and mock shift hook. |
| `features/rosters/hooks/useRoster.ts` | Explicit mock/in-memory shift layer with hardcoded employees, departments, rates, and availability windows. |
| `features/rosters/pages/RostersListPage.tsx` | Real roster list with branch/status filters, table browsing, create/edit, and copy-week workflow. |
| `features/rosters/pages/RosterDetailPage.tsx` | Real roster-week detail with publish/delete/edit, open-shift metric, and read-only weekly grid. |
| `features/rosters/hooks/useRosters.ts` | Real roster CRUD, branch/status/week filtering, publish, copy-week, and cache invalidation. |
| `features/rosters/components/QuickShiftModal.tsx` | Mock-backed quick create/edit/delete; employee is required and open-shift creation is unavailable. |
| `features/rosters/components/RosterWeekGrid.tsx` | Read-only weekly agenda with unassigned-card rendering and responsive day stacking. |
| `routes/AppRoutes.tsx` and `Components/layout/nav-items.ts` | Roster routes/navigation are available to company administrators and schedulers. |

## References

[1]: https://fullcalendar.io/docs/event-dragging-resizing "FullCalendar — Event Dragging and Resizing"
[2]: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ "W3C WAI-ARIA Authoring Practices — Modal Dialog Pattern"
