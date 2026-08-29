# Task 16–18 Audit: Notifications, Settings, and Profile

**Project:** Rosterly staff-scheduling SaaS  
**Scope:** Existing frontend surfaces for notifications, settings, and profile. No application code was modified for this audit.  
**Audit date:** 17 August 2026

## Executive assessment

The notification feature is the strongest of the three. It uses a real paginated API, unread/read filters, mark-read and mark-all-read mutations, archive/delete behaviour, action routing, and Laravel Echo invalidation for realtime updates. The main architectural concern is that the persistent header bell owns the realtime listener while the full inbox depends on that shell being mounted.

Settings is currently a **presentation prototype**, not a persisted configuration product. `SettingsDashboardPage` uses hardcoded organisation, branch, and policy objects, simulates saves with `setTimeout`, logs submitted values to the console, and explicitly contains TODOs for API integration. The departments tab is a placeholder even though Departments already has a separate management feature.

Profile is effectively **missing from the active React Router application**. The header links to `/settings/profile`, but there is no active route or feature page for that path. A legacy Inertia profile form exists under `resources/js/Pages/Profile/Partials`, but it uses the old Inertia transport, Headless UI, legacy components, and hard-coded gray/indigo classes and is not connected to the current SPA route tree.

| Task | Current maturity | Primary finding | Recommended priority |
 --- | --- | --- | --- |
 | **Task 16 — Notifications** | Real API and realtime foundation | Good core capability; realtime ownership and UI primitive adoption should be consolidated | **Medium** |
 | **Task 17 — Settings** | Mock configuration shell | No persistence, no real company configuration source, and departments are unfinished | **Critical** |
 | **Task 18 — Profile** | Missing active SPA page | Header link resolves to no active route; only an unused Inertia-era form exists | **Critical** |

## Current architecture and route coverage

| Surface | Route or entry point | Current data source | Status |
 --- | --- | --- | --- |
 | Notification inbox | `/notifications` | Real `/notifications` API | Active and paginated |
 | Header notification menu | Authenticated shell header | Same API, five recent records, optional Echo listener | Active |
 | Organisation settings | `/settings` | Hardcoded mock objects | Prototype only |
 | Company settings | `/companies/:id/settings` | Separate existing company settings route | Potential overlap requiring ownership decision |
 | Profile menu link | `/settings/profile` | No active React Router route | Broken/incomplete |
 | Legacy profile form | `resources/js/Pages/Profile/Partials/UpdateProfileInformationForm.tsx` | Inertia `patch(route('profile.update'))` | Legacy/unconnected |

The header exposes Profile and Settings as if both were available. Only Settings has an active route in the current feature tree. This is a navigation integrity issue because a user can select Profile and reach a route that is not registered.

## Task 16 — Notifications

### Strengths

The notification hook maps API and broadcast payloads into a stable presentation model. It supports paginated list queries with all/unread/read filters, unread counts, mark-read, mark-all-read, and archive/delete. The inbox resets to page one when a filter changes and provides page metadata with previous/next controls.

The header menu limits recent notifications to five records, retains unread count, provides mark-all-read, and links to the full inbox. Notification selection marks an unread item as read before navigating to its action URL. The hook updates every cached notification list after a read, mark-all, or archive mutation, which keeps the header and inbox count reasonably consistent.

The realtime implementation subscribes to `App.Models.User.{id}` through Laravel Echo when `realtime` is enabled, then invalidates all notification queries on a broadcast. The header bell owns this listener, which prevents multiple shell consumers from opening duplicate channels.

| Strength | Why it matters |
 --- | --- |
 | Real paginated API | The inbox is usable for large notification histories. |
 | Shared cache keys | Header and inbox can reconcile unread counts through TanStack Query. |
 | Realtime invalidation | New events can refresh both the badge and inbox. |
 | Safe action mapping | Known leave and shift notifications route to relevant application surfaces. |
 | Mark/read/archive mutations | Users can manage notification state rather than only view it. |

### Notification findings

The full notification page still uses local raw buttons and raw tab classes instead of the approved local Button, Tabs, Badge, and feedback primitives. The header bell has already moved closer to the local system, but the inbox and bell should consume one shared `NotificationMenu` and `NotificationList` contract so action labels, empty states, and read-state presentation do not diverge.

Realtime ownership is shell-coupled. The inbox calls `useNotifications` with `realtime` disabled and assumes the authenticated dashboard header is present. This is acceptable inside the current dashboard shell but fragile if the inbox is rendered in another layout, tested in isolation, or later embedded in a mobile-specific route. The hook should eventually use a provider-level notification subscription or a documented single-owner boundary.

The type normalizer recognises a limited set of shift and leave notification variants and maps unknown types to `system_alert` with no action URL. This is safe as a fallback, but system notifications need a stable presentation for severity, source, timestamp, and optional action. Archive is labelled “deleted” in the page toast, which blurs the distinction between a user-hidden notification and permanent deletion.

| Finding | Impact | Recommendation |
 --- | --- | --- |
 | Inbox page bypasses local UI primitives | Controls and tabs can drift from the design system | Migrate to local Button, Tabs, Badge, Pagination, EmptyState, and ErrorState. |
 | Realtime listener belongs to header | Inbox depends on shell mounting for live updates | Introduce one notification provider/subscription boundary. |
 | Limited notification type/action registry | New backend notifications fall back to generic alerts | Maintain a typed notification registry with labels, severity, icon, and action resolver. |
 | Archive toast says “deleted” | Users cannot distinguish hide/archive from permanent deletion | Use precise “Archived” language and confirm backend semantics. |
 | Optimistic cache updates lack visible mutation pending state | Rapid repeated actions can feel ambiguous | Disable per-item actions while pending and announce completion. |
 | Notification preferences are absent | Users cannot control email/in-app categories | Add settings for notification channels and categories once backend policy exists. |

## Task 17 — Settings

### Current implementation

`SettingsDashboardPage` renders a nested vertical tab shell with Company Profile, Branches, Departments, and Operational Policies tabs. It shows a mock organisation profile, a mock branch configuration, and mock policy values. Branch submission waits for a simulated delay, logs to the console, and clears dirty state. Policy changes wait for a simulated delay and update local React state only. The source comments explicitly state that the API calls are stubs.

The Company Profile tab is read-only and displays fixture data. The Branches tab renders one `BranchForm` with one fixture branch, despite the application having a separate real Branches management feature. The Departments tab is a “coming soon” message, despite the existing Departments CRUD surface. The Operational Policies tab has a usable toggle panel but no persistence, error handling, server validation, audit history, or permission feedback.

| Finding | Impact | Recommendation |
 --- | --- | --- |
 | Mock organisation/branch/policy objects | Users can believe settings were saved when nothing reached the server | Replace fixtures with typed query/mutation hooks and authoritative API responses. |
 | `setTimeout` and `console.log` save stubs | No persistence, retry, or error semantics | Implement API mutations with pending, success, error, and rollback states. |
 | Departments tab is a placeholder | Settings presents an incomplete duplicate of a real feature | Either remove the tab or embed the real department settings contract. |
 | Branches duplicate existing management | Two settings surfaces may compete for ownership | Define whether settings contains policy-only configuration while CRUD remains in Branches. |
 | Company Profile is read-only | No clear edit workflow for organisation configuration | Add explicit edit permissions and a server-backed form, or label the tab as read-only. |
 | Dirty state is incomplete | Policy changes do not clearly participate in unsaved-change protection | Centralise dirty state and distinguish saved server state from draft state. |
 | Tabs are local React state only | Deep links and browser back/forward do not preserve settings context | Use URL query/hash state or nested settings routes. |
 | No settings loading/error/empty states | Failures cannot be communicated consistently | Use the local shared feedback primitives. |

### Responsive and accessibility findings

The vertical sidebar has a fixed `w-64` width inside a horizontal flex layout. At narrow widths this can consume most of the viewport and make the content area difficult to use. Settings needs a mobile select, horizontal tab strip, or drawer pattern rather than retaining a fixed desktop sidebar.

The settings navigation uses buttons with `aria-current="page"`, which communicates the active destination reasonably, but it is not implemented as a tablist with tab semantics and keyboard roving behaviour. The local Tabs primitive should be used if the tabs are content tabs; otherwise, the buttons should be treated as navigation items with URL state.

The unsaved-change alert dialog is a useful idea, but its dirty state currently reflects only selected local actions and cannot guard real browser navigation or route changes. Settings should distinguish draft editing from server persistence and provide a clear save/cancel contract per section.

## Task 18 — Profile

### Missing active SPA profile feature

There is no `resources/js/features/profile` directory and no active `/settings/profile` route in the React Router tree. The header profile link therefore points to an unregistered path. This is a direct broken-navigation issue and should be resolved before profile-dependent flows are considered complete.

A legacy form exists under `resources/js/Pages/Profile/Partials/UpdateProfileInformationForm.tsx`. It uses `@inertiajs/react`, `@headlessui/react`, legacy `InputLabel`, `TextInput`, `PrimaryButton`, `InputError`, old Tailwind gray/indigo classes, and the Laravel route helper. It is not a consumer of the current `apiClient`, `useAuth`, React Router, or local design-system primitives.

| Profile capability | Current state | Recommendation |
 --- | --- | --- |
 | View name/email | Available in authenticated session data and header | Add an active profile page with server-backed user data. |
 | Edit name/email | Only legacy Inertia form exists | Add typed API mutation and form validation in the SPA. |
 | Email verification | Legacy Inertia form references verification routes | Confirm the active Sanctum/API verification contract before exposing resend UI. |
 | Change password | No active profile surface identified | Add a separate security section with current-password and new-password validation. |
 | Avatar/identity | Header has presentation fallback | Decide whether avatar upload is in scope and provide accessible fallback. |
 | Session/security | No active profile security surface identified | Add active sessions, logout-other-sessions, or explicitly defer them. |
 | Preferences | Theme is shell-level; notification preferences are absent | Define account versus workspace preference ownership. |

## Cross-feature state and permission findings

Notifications, settings, and profile are cross-cutting surfaces. Their state should be owned deliberately rather than recreated by each page.

| Concern | Current owner | Risk | Recommended owner |
 --- | --- | --- | --- |
 | Authenticated user identity | `useAuth`/session resource plus notification current-user request | Duplicate user reads and possible stale profile data | One authenticated session cache with profile mutation invalidation. |
 | Notification unread count | Notification hook/header bell | Shell dependency for realtime | Notification provider or shell-level subscription service. |
 | Theme preference | Theme provider/local persistence | Separate from account preferences | Theme provider for device preference; optional server preference later. |
 | Organisation settings | Mock settings page | No real source of truth | Typed settings API and permission-scoped query hooks. |
 | Profile data | Legacy Inertia page only | Broken active route | Active profile feature using API/session cache. |
 | Permission decisions | Route guards and feature-specific fallbacks | Role/permission drift | Session-provided capability contract plus server enforcement. |

## Recommended implementation order

| Priority | Work | Outcome |
 --- | --- | --- |
 | **18.1** | Add the active profile route and SPA profile feature | Repair the broken header link and establish the account surface. |
 | **18.2** | Implement profile read/update and password/security contracts | Replace the unused Inertia form with typed API workflows. |
 | **17.1** | Decide settings ownership versus existing Branches/Departments pages | Prevent duplicate management surfaces. |
 | **17.2** | Replace mock settings with real query/mutation hooks | Make saves authoritative and recoverable. |
 | **17.3** | Convert settings tabs to URL-addressable responsive navigation | Support deep links, back/forward, and mobile use. |
 | **17.4** | Add audit/error/pending states and dirty-draft protection | Make configuration changes safe and understandable. |
 | **16.1** | Consolidate notification realtime ownership | Keep header and inbox consistent without shell coupling. |
 | **16.2** | Migrate inbox controls to local primitives | Align notification centre with the approved design system. |
 | **16.3** | Add typed notification registry and channel preferences | Make new backend notification types actionable and configurable. |
 | **16.4** | Add cross-feature scenario tests | Cover read/unread, realtime delivery, archive, profile updates, settings failure, permission differences, and mobile navigation. |

## Audit evidence

| Source | Key observation |
 --- | --- |
| `features/notifications/hooks/useNotifications.ts` | Real paginated API, cache keys, Echo subscription option, unread mutations, archive, and action mapping. |
| `features/notifications/pages/NotificationCenterPage.tsx` | Full inbox with all/unread/read filters, refresh, mark-all, archive, retry, and pagination. |
| `features/notifications/components/NotificationBell.tsx` | Header-owned recent notification menu and realtime ownership boundary. |
| `features/settings/pages/SettingsDashboardPage.tsx` | Mock organisation, branch, and policies; simulated saves; unfinished departments tab; local dirty-tab dialog. |
| `features/settings/components/BranchForm.tsx` and `PolicyTogglePanel.tsx` | Presentational settings controls without real persistence ownership. |
| `routes/AppRoutes.tsx` | Active `/settings`, `/notifications`, and company-settings routes; no active `/settings/profile` route. |
| `Components/layout/Header.tsx` | Profile link points to `/settings/profile`; theme and notifications are shell controls. |
| `Pages/Profile/Partials/UpdateProfileInformationForm.tsx` | Legacy Inertia profile form, not connected to the active SPA route tree or design system. |

## References

[1]: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html "W3C WCAG 2.2 — Status Messages"
[2]: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ "W3C WAI-ARIA Authoring Practices — Tabs Pattern"
[3]: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ "W3C WAI-ARIA Authoring Practices — Modal Dialog Pattern"
