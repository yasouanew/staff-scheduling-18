# Task 14–15 Audit: Shifts and Leave

**Project:** Rosterly staff-scheduling SaaS  
**Scope:** Existing frontend surfaces for shifts, leave requests, and leave types. No application code was modified for this audit.  
**Audit date:** 17 August 2026

## Executive assessment

The shifts and leave features are substantially more production-oriented than the mock-backed roster calendar. Shifts use real API-backed queries and mutations, support branch/status/date filtering, roster context, optional unassigned state, required staff, branch timezone hints, assignment, and client-side conflict warnings. Leave requests use real endpoints, role-aware filtering, multipart attachments, allowance calculations, approval and rejection workflows, notification invalidation, and roster/calendar refresh intent.

The primary product risk is **fragmentation**. The shift CRUD page, roster calendar, and real roster detail page each represent scheduling in different ways. The shift page has the strongest real API contract, while the roster calendar has the strongest direct-manipulation interaction but is backed by mock data. Leave approval correctly invalidates roster and notification queries, but the user experience remains list/card-oriented rather than integrated into the roster workspace as a visible availability block and staffing risk.

| Task | Current maturity | Primary finding | Recommended priority |
| --- | --- | --- | --- |
| **Task 14 — Shifts** | Real API-backed CRUD and assignment | Strong operational fields, but the page is a conventional list and duplicates the roster calendar’s shift model | **High** |
| **Task 15 — Leave** | Real request, approval, attachment, and allowance workflow | Good business workflow; needs consistent UI primitives, server-authoritative role/validation display, and deeper roster integration | **High** |

## Current architecture and routes

| Surface | Route | Data source | Main audience |
 --- | --- | --- | --- |
| Shifts list | `/shifts` | Real `/shifts` API with branch/status/date filters | Company administrators and schedulers |
| Shift create | `/shifts/create` | Same page opens the `ShiftForm` drawer | Company administrators and schedulers |
| Leave types | `/leave-types` | Real `/leave-types` CRUD API | Company administrators |
| Leave request list | `/leave-requests` | Real leave-request API; employee or reviewer scope | Employees, company administrators, schedulers according to route permissions |
| New leave request | `/leave-requests/new` | Real multipart leave-request submission | Employees and authorised managers |
| Leave request detail | `/leave-requests/:id` | Real detail/approve/reject API | Request owner and authorised reviewers |

The route tree contains separate role groups for leave types, leave requests, and shifts. Navigation exposes Shifts and Leave Requests to company roles, while Leave Types is company-admin-only. This is broadly coherent, but the exact reviewer capability is inferred in the leave hook through both permission checks and legacy role-name fallbacks rather than through one session-authoritative capability contract.

## Task 14 — Shifts

### Strengths

The shifts list uses real API-backed data and supports branch, status, and date-from filters. It also loads real rosters, active employees, active positions, and active branches as references for the form. The form can create and edit shifts, assign a roster and local branch timezone, select an optional position, leave the employee unassigned, set required staff, add notes, and select a status. This is a good operational CRUD foundation.

The assignment dialog limits active employees to the shift’s branch or branchless employees and performs a client-side overlap check before allowing an “Assign anyway” decision. The shift form separately computes possible employee conflicts from the currently loaded shift set and displays a visible warning. Error feedback uses API error messages and successful mutations invalidate related shift and roster caches.

| Capability | Current implementation | Assessment |
 --- | --- | --- |
| Real shift transport | `GET/POST/PUT/DELETE /shifts` and assignment endpoint | Strong foundation. |
| Roster context | Roster selector and roster-aware options | Present, but not inherited from the primary roster workspace. |
| Unassigned shifts | Employee is nullable and form exposes “Leave unassigned” | Good; this should become a first-class roster filter/state. |
| Required staffing | `requiredStaff` is editable and included in the form | Good; coverage comparison is not yet visible in the roster workspace. |
| Branch timezone | Roster branch timezone is shown as a hint | Helpful, but date/time display should be consistent throughout the app. |
| Position/department context | Position options include department name | Present, but the page lacks a department filter. |
| Assignment | Branch-aware active employee selection | Useful; no direct unassign action and server conflict authority is not surfaced. |
| Conflict warnings | Client-side overlap checks and warning UI | Helpful as early feedback, insufficient as the only authority. |

### Shift workflow gaps

The page filters by branch, status, and date-from, but the hook contract supports additional fields including roster ID, employee ID, and date-to. The UI therefore does not expose the full API filtering capability. In particular, employee filtering is important for operational questions such as “where is this employee scheduled?” and an “unassigned only” filter is essential for staffing cleanup.

The page loads up to 100 records for shifts, rosters, employees, positions, and branches. It does not expose explicit pagination in the visible filter area, so larger tenants may receive an incomplete or heavy dataset. The same page calculates statistics from the current result set, which should be labelled as filtered-view metrics and not interpreted as company-wide totals.

The frontend shift mutation payload does not include `break_minutes` or `paid_break`, even though the broader roster domain contains payable-hour and break concepts. This creates a domain mismatch: the schedule can display or calculate hours using break assumptions elsewhere, while the Task 14 form does not let the user define them. The product should decide whether break fields belong to the shift contract, the shift template, or the roster policy and then use one authoritative representation.

| Finding | Impact | Recommendation |
 --- | --- | --- |
| No employee filter on the page | Difficult to inspect an individual’s schedule | Add employee filter and preserve it in the URL/workspace state. |
| No department filter | Hard to plan department-level coverage | Add department filter sourced from the API. |
| No “unassigned only” filter | Open staffing work is not immediately actionable | Add an explicit unassigned/open state filter and count. |
| Only date-from is exposed | Date windows are incomplete | Add date-to or move filtering into the week-scoped roster workspace. |
| `perPage: 100` without visible pagination | Large tenants may be incomplete or slow | Use server pagination or week-scoped queries. |
| Assignment warns but permits override | A client can bypass a real scheduling conflict | Send the assignment to server validation and show structured conflict results. |
| No direct unassign action | Clearing an assignment requires opening general edit | Add “Unassign employee” as an explicit reversible action. |
| Break fields not persisted by shift mutation | Hours/pay calculations can diverge | Establish one break policy and expose/persist it consistently. |

### Shift design-system and accessibility findings

The audited shift and leave-type surfaces do not import the local `@/Components/ui` primitives. They use repeated native inputs/selects and raw button class strings, while several components use raw Radix primitives. The shifts form has useful `aria-invalid` attributes, labels, explicit button types, focus-visible styling, and role alerts for conflicts. However, most field error messages are not consistently linked using `aria-describedby`, and raw controls should be migrated to the shared `Field`, `Input`, `Select`, `Button`, `Dialog`, `Badge`, and feedback primitives.

The assignment workflow should preserve keyboard operation and announce conflict state in a stable region rather than relying only on a modal warning and toast. Destructive delete and unassign operations should use the shared alert-dialog pattern and explain whether the shift itself or only its employee assignment will be changed.

## Task 15 — Leave

### Strengths

Leave requests are backed by real APIs and support employee self-service and manager-assisted submission. The list derives reviewer capability, scopes employees to the current user when appropriate, and exposes status and employee filters for managers. The form validates dates and sessions, calculates requested days, displays allowance/balance feedback, prevents requests that exceed available allowance, supports accepted attachment types/count/size rules, and submits attachments as multipart form data.

Approval collects optional administrator notes. Rejection requires a non-empty reason. The mutation layer invalidates leave-request, roster, and notification query keys, and the UI communicates that approved leave blocks calendar coverage and notifies the employee. The detail page exposes attachments, approver/rejecter information, status history, rejection reason, and the approved calendar-blocking state.

| Capability | Current implementation | Assessment |
 --- | --- | --- |
| Employee submission | Real form with self-service identity scoping | Strong. |
| Manager review | Approve/reject controls with notes/reason | Strong; permissions should be server-authoritative. |
| Allowance calculation | Live requested days and remaining balance | Good UX; server remains final authority. |
| Partial-day sessions | Start/end session fields | Useful; needs clear visual validation for invalid half-day combinations. |
| Attachments | Count, type, size messaging and multipart submission | Strong; add upload progress/failure recovery. |
| Notifications | Invalidation and toast statements; backend notifications exist | Good integration intent; verify all delivery states on mutation failure/retry. |
| Calendar blocking | Approved requests invalidate roster data and are represented as blocks in scheduling flows | Good integration, but not yet a unified workspace view. |
| Employee/reviewer scope | Current user and permission/role logic | Functional, but duplicated capability inference should be consolidated. |

### Leave workflow gaps

The leave list is a good request queue and history surface, but it does not provide a calendar-oriented view of absences, upcoming coverage risk, overlapping leave, or affected shifts. The roster workspace should consume approved leave blocks as first-class schedule constraints and show them alongside shifts with accessible labels. The current integration is primarily query invalidation and event conversion rather than a visible, filterable staffing decision surface.

The reviewer helper combines permission checks with hardcoded role-name fallbacks. This can drift from the backend permission matrix and make frontend behaviour difficult to reason about when roles or permissions change. The UI should consume one capability such as `canReviewLeaveRequests` from the authenticated session or use a shared permission predicate backed by the server response.

The list requests up to 100 items and exposes status and employee filters, but not date range, branch, department, leave type, or “upcoming only” filters. Those filters become especially important for managers reviewing coverage across larger teams. Empty, loading, and error presentations are implemented locally rather than through the approved shared feedback primitives.

Leave type management is a separate company-admin CRUD surface with allowance, paid/unpaid, rollover, and active status configuration. The leave request form consumes active leave types and displays paid/unpaid information, but it should also clearly communicate rollover/allowance policy when that policy affects the calculated balance.

| Finding | Impact | Recommendation |
 --- | --- | --- |
| No leave calendar view in the leave feature | Managers must infer coverage from a list | Add a calendar/agenda mode or integrate approved blocks into the roster workspace. |
| No date-range/upcoming filter | Review queues become difficult to prioritise | Add upcoming, date range, leave type, branch, and department filters. |
| Reviewer logic mixes permissions and role names | Capability drift and inconsistent access | Use a single server-authoritative capability contract. |
| Per-page 100 without visible pagination | Large request histories may be incomplete | Add pagination or virtualised/incremental loading. |
| Attachments lack visible upload progress/retry | Large files or network failures are ambiguous | Add progress, per-file failure, retry, and clear upload status. |
| Approval/rejection is list-card oriented | Important staffing effects are detached from schedule context | Surface affected shifts and coverage implications before decision. |
| Balance is calculated client-side | Client display can differ from server entitlement rules | Keep the preview, but show server validation errors as authoritative. |
| Leave types and requests are separate contexts | Policy is not always visible at decision time | Show allowance, paid state, rollover, and remaining balance context in review. |

## Cross-feature integration with the roster workspace

Task 14 and Task 15 should be treated as operational inputs to the primary roster workspace, not isolated CRUD pages.

| Operational question | Required integration |
 --- | --- |
| Which shifts are open? | Shift API/open state, roster summary, and unassigned filter. |
| Is an employee unavailable? | Approved leave blocks and real availability should appear on employee lanes and conflict checks. |
| Can this shift be assigned? | Server-authoritative overlap, availability, leave, branch, and required-staff validation. |
| Which leave requests need a decision? | Reviewer queue with affected dates, shifts, coverage, and employee context. |
| Is staffing complete? | Compare `requiredStaff` with assigned employees per shift/department/day. |
| What will employees see? | Publish state and notification outcome after roster or leave changes. |

## Recommended implementation order

| Priority | Work | Outcome |
 --- | --- | --- |
| **14.1** | Make the real roster workspace the primary shift editing context | Remove duplicated calendar/shift data models. |
| **14.2** | Add employee, department, roster, date-range, and unassigned filters | Make shift operations actionable at scale. |
| **14.3** | Move assignment and conflict authority to the server while retaining client preflight | Prevent bypassable client-only warnings. |
| **14.4** | Add explicit unassign and structured conflict resolution | Support open-shift planning and safe corrections. |
| **14.5** | Decide and persist break/pay policy | Keep duration, payable hours, templates, and payroll-facing metrics consistent. |
| **15.1** | Keep real leave request transport and allowance preview | Preserve the strongest current workflow foundation. |
| **15.2** | Consolidate reviewer capability from session permissions | Remove role-name fallback drift. |
| **15.3** | Add leave calendar/upcoming filters and coverage impact | Make leave review a scheduling decision, not only an approval queue. |
| **15.4** | Show approved leave and pending risk inside the roster workspace | Let schedulers understand availability within seconds. |
| **15.5** | Add attachment progress/retry and server balance feedback | Improve resilience without weakening policy authority. |
| **15.6** | Migrate both features to local UI primitives | Standardise controls, dialogs, fields, badges, feedback, and accessibility. |
| **15.7** | Add scenario coverage | Test time zones, overnight shifts, partial days, allowance rollover, attachments, conflicts, unassigning, approval, rejection, and publish transitions. |

## Audit evidence

| Source | Key observation |
 --- | --- |
| `features/shifts/pages/ShiftsListPage.tsx` | Real shift list with branch/status/date filters, roster/reference loading, statistics, create/edit/assign/delete orchestration, and error retry. |
| `features/shifts/components/ShiftForm.tsx` | Typed shift form with timezone hint, optional employee, required staff, status, notes, and client conflict warnings. |
| `features/shifts/components/AssignEmployeeModal.tsx` | Branch-aware employee filtering and client overlap warning with assign-anyway path. |
| `features/shifts/hooks/useShifts.ts` | Real shift API, filter contract, assignment mutation, and cache invalidation; break fields are not included in the mutation payload. |
| `features/leave-requests/pages/LeaveRequestsListPage.tsx` | Role-scoped request list, manager filters, stats, approval/rejection callbacks, empty/error/loading states, and notification/calendar messaging. |
| `features/leave-requests/components/LeaveRequestForm.tsx` | Date/session validation, leave balance preview, attachment upload, and submit guard. |
| `features/leave-requests/hooks/useLeaveRequests.ts` | Real multipart transport, approval/rejection endpoints, current-user capability inference, and roster/notification invalidation. |
| `features/leave-requests/components/ApproveRejectButtons.tsx` | Approval notes and required rejection reason in dialog workflows. |
| `features/leave-requests/pages/LeaveRequestDetailPage.tsx` | Attachment display and complete request decision/status context. |
| `features/leave-types/*` | Active leave-type CRUD with allowance, paid/unpaid, rollover, and status policy fields. |

## References

[1]: https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html "W3C WCAG 2.2 — Error Identification"
[2]: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html "W3C WCAG 2.2 — Status Messages"
[3]: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ "W3C WAI-ARIA Authoring Practices — Modal Dialog Pattern"
