# Roster Publishing & Post-Publication Change-Management System — Implementation Plan

Status: Phase A complete (analysis). Plan drives Phases B–G.

## 1. Existing architecture (reused, not redesigned)

| Concern | Existing implementation | Reuse for this feature |
| --- | --- | --- |
| Roster lifecycle | `rosters.status` (`draft/published/archived`), `published_at`, `published_by` columns; [`Roster::isPublished()`](app/Models/Roster.php:78), `published()`/`draft()` scopes | Publish state + timestamp already present |
| Publish endpoint | `POST /api/v1/rosters/{roster}/publish` → [`RosterController::publish()`](app/Http/Controllers/Api/RosterController.php:142) → [`RosterService::publish()`](app/Services/RosterService.php:131) | Extend; current service sets status only — add validation, change recording, notifications |
| Publish permission | `roster.publish` permission; [`RosterPolicy::publish()`](app/Policies/RosterPolicy.php:65) | Reuse unchanged |
| Cancelled shifts | `shifts.status` accepts `cancelled`; [`Shift::scheduled()`](app/Models/Shift.php:73) scope | Cancellation = status change, no hard delete |
| Notifications (DB) | Standard Laravel `notifications` table + [`NotificationController`](app/Http/Controllers/Api/NotificationController.php) (index/read/read-all/delete) + `NotificationResource` | Reuse for in-app center |
| Push (FCM) | `FcmChannel`, `FcmMessage`, `DeviceToken` (with `active()` scope), Kreait/Firebase, safe no-config fallback | Reuse; roster notifications adopt same channel |
| Notification pattern | [`ShiftAssignedNotification`](app/Notifications/ShiftAssignedNotification.php) (ShouldQueue, via database/broadcast/fcm, toArray/toFcm) | Model new roster notifications after it |
| Audit trail | Spatie `activity_log` via `LogsActivity` on Roster/Shift/Employee/User | Keep as generic audit; **add** a purpose-built `roster_changes` table for change records + notifications |
| Auth/RBAC | Sanctum + `auth:sanctum`, `company.access`, `account.active`; Spatie roles/permissions (`super_admin`, `company_admin`, `scheduler`, `employee`) | Reuse; no new roles needed |
| Roster validation | `RosterConflictService` (overtime_risk, leave_conflict, double_booked) | Reuse for publish pre-flight |
| React UI | `RosterDetailPage`, `RosterCalendarPage`, `useRosters` hooks, `useShifts`, shadcn-style ui, `AlertDialog` | Extend with publish/post-publish preview + change summary |

## 2. Gaps to implement

1. **Publish is not validated/notified** — `RosterService::publish()` only flips status; needs validation + `ROSTER_PUBLISHED` notifications (idempotent, queued, non-blocking).
2. **No snapshot/version** — add `version` column (optimistic lock) to `rosters`.
3. **No change records** — add `roster_changes` table (id, roster_id, shift_id, employee_id, action, old_data, new_data, performed_by, created_at).
4. **No centralized notification-type constants** — add an enum/constants class; reuse in Laravel + React + React Native.
5. **Shift delete hard-deletes** — for published rosters must become cancel-by-status.
6. **No change preview/apply endpoints** — add `POST /rosters/{roster}/changes/preview` and `POST /rosters/{roster}/changes/apply`.
7. **React Native app absent** — no RN project in this workspace (`src/` is empty); Phase E is blocked until location/access is provided.

## 3. Notification type enum (single source of truth)

`roster_published`, `roster_updated`, `shift_added`, `shift_updated`, `shift_cancelled`, `shift_assigned`, `shift_reassigned`, `shift_location_changed`.

Mapping to change actions: publish → `roster_published`; any saved change on a published roster → `roster_updated` as the summary envelope, with per-shift detail types (`shift_added`/`shift_updated`/`shift_cancelled`/`shift_reassigned`/`shift_location_changed`) inside the payload; individual DB rows remain in `roster_changes`.

## 4. Change types captured by the detector

- shift added (new shift row / assigned employee)
- shift updated (times, date, break, notes, position, required staff, location/branch)
- shift cancelled (status → cancelled)
- shift reassigned (employee A → employee B ⇒ two effects)
- shift location changed (branch change ⇒ `shift_location_changed`)

## 5. API additions (follow existing conventions under `/api/v1`, success envelope)

| Endpoint | Purpose |
| --- | --- |
| `POST /rosters/{roster}/publish` | existing — extended with validation + notifications |
| `POST /rosters/{roster}/changes/preview` | validate a set of mutations; return grouped affected-employee summary (backend is source of truth) |
| `POST /rosters/{roster}/changes/apply` | transaction: apply mutations, record `roster_changes`, bump `version`, then dispatch queued notifications after commit |
| `GET /rosters/{roster}/changes` | change/audit history for the roster |

`apply` accepts `{ version, mutations: [...] }`; version mismatch → 409.

## 6. Transaction & concurrency

`DB::transaction`: (1) verify `version` matches, (2) apply shift mutations (cancel instead of delete when published), (3) write `roster_changes` rows, (4) bump `version` (+`updated_at`), (5) persist one grouped notification per affected employee. Commit → dispatch `RosterChangeNotification` jobs (queued, FCM via `FcmChannel`) — push never blocks/rolls back the transaction.

## 7. Deliverables per phase

- **B** migrations: `roster_changes` table; add `version` to `rosters`.
- **C** Laravel: `RosterChangeType` enum/constants; `RosterChange` model; `RosterChangeDetector`; `RosterChangeService` (preview + apply); extend `RosterService::publish()`; `RosterChangeNotification` (+ publish variant); controller methods + routes; extend `ShiftService::delete()` to cancel when published; resources for changes/preview; optimistic-lock handling.
- **D** React: publish button wiring, published-state UI, edit-published confirmation, change preview dialog (grouped by employee, "N employees affected", Cancel / Save Changes & Notify).
- **E** React Native: **blocked** — app not present in workspace.
- **F** tests: publishing, add/edit/cancel/reassign, grouped multi-change, concurrency (409), authorization, idempotency.
- **G** end-to-end verification (John/Sarah/David scenario).
