# Notifications Frontend Alignment

> **Status:** Implemented — frontend aligned with the actual backend.
> **Scope:** Notifications: `notifications`, `device_tokens`, users. Trace: Backend notification → database → API → React service → hook → notification component. Verify: Notification list, Unread count, Read/unread state, Mark as read, Mark all as read, Delete (archive), Notification details (embedded in list payload), FCM-related frontend integration. **Roster is out of scope.**
> **Method:** Backend/database/API is the **source of truth**. Every notification type and field was traced from the backend notification classes (`via()` channels + `toArray()` payloads), the `notifications` table, `NotificationController`, `NotificationResource`, and `FcmChannel`/`DeviceToken*` pipeline, and compared against the frontend (types, hook, components, page). Only the frontend was changed — no backend code, migrations, business rules, or API payloads were touched.
> **Reference docs:** `.roo/ui-ux.md` (architectural reference — not the ultimate source of truth), `docs/frontend-alignment/system-map.md`, `docs/task-16-18-notifications-settings-profile-audit.md`.

---

## 1. Backend Source of Truth (read-only reference)

### 1.1 `notifications` table (`2026_07_27_000019`)

Standard Laravel database notification table — there is **no custom `Notification` model**; rows are read through the `Illuminate\Notifications\DatabaseNotification` morph relationship (`User::notifications()`).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (primary key) | generated via `Str::uuid()` |
| `type` | string | class basename of the notification class (e.g. `LeaveRequestSubmittedNotification`) |
| `notifiable_type` / `notifiable_id` | morphs | `App\Models\User` + user id |
| `data` | json (text) | the `toArray()` payload — contains `type`, `title`, `body`, and type-specific fields |
| `read_at` | timestamp, nullable | null = unread |
| `created_at` / `updated_at` | timestamps | |

### 1.2 `device_tokens` table (`2026_07_27_000014`) + `DeviceToken` model

| Column | Type / Validation | Notes |
|---|---|---|
| `id` | bigIncrements | |
| `company_id` | foreignId → `companies` | set server-side from the user |
| `user_id` | foreignId → `users` | owner |
| `device_name` | string, nullable | |
| `platform` | string, **required** | `in:ios,android,web` (`RegisterDeviceTokenRequest`) |
| `token` | text, **required** | max 512 |
| `app_version` / `os_version` | string, nullable | |
| `is_active` | boolean, default `true` | deactivated when FCM reports the token as `NotFound` |
| `last_used_at` | timestamp, nullable | set to `now()` on register |
| `created_at` / `updated_at` | timestamps | |

Model: `$fillable = [company_id, user_id, device_name, platform, token, app_version, os_version, is_active, last_used_at]`; `scopeActive()` filters `is_active = true`; `company()`/`user()` belongsTo. `DeviceTokenService::register()` uses `updateOrCreate(['token' => ...], [...])` (reassigns a shared token to the current user); `unregister()` deletes by token scoped to the user.

### 1.3 Notification classes → database-channel types (source of truth for `data['type']`)

Only classes that use the **`database`** channel (or write DB rows directly) appear in the web notification inbox.

| Notification class | `via()` | `data['type']` | Who receives it |
|---|---|---|---|
| `LeaveRequestSubmittedNotification` | `database`, `broadcast`, `fcm` | `leave_request.submitted` | approvers (managers/admin) |
| `LeaveRequestStatusNotification` | `database`, `broadcast`, `fcm` | `leave_request.approved` / `leave_request.rejected` | the employee who submitted |
| `ShiftAssignedNotification` | `database`, `broadcast`, `fcm` | `shift.assigned` | assigned employee |
| `TrialEndingNotification` | `database`, `broadcast`, `mail` | `billing.trial_ending` | `company_admin` users |
| `TrialExpiredNotification` | `database`, `broadcast`, `mail` | `billing.trial_expired` | `company_admin` users |
| `SubscriptionRenewalReminderNotification` | `database`, `broadcast`, `mail` | `billing.subscription_renewal_reminder` | `company_admin` users |
| `SubscriptionActivatedNotification` | `database`, `broadcast`, `mail` | `billing.subscription_activated` | `company_admin` users |
| `RosterPublishedNotification` | `broadcast`, `fcm` (**DB row written in-transaction** in `RosterChangeService::persistDatabaseNotifications`) | `roster_published` (`RosterChangeType::RosterPublished`) | employees with shifts |
| `RosterChangeNotification` | `broadcast`, `fcm` (**DB row written in-transaction**) | `roster_updated` (`RosterChangeType::RosterUpdated`) | affected employees |

> **Roster types are out of scope** for this alignment task. They are noted here only because they do reach the web inbox through the DB rows created in [`RosterChangeService.php`](app/Services/RosterChangeService.php:425). They fall back to the frontend's `system_alert` presentation.
>
> The remaining classes are **not** surfaced in the web inbox because they use only the `mail` channel: `WebInvitationNotification`, `MobileInvitationNotification`, `EmployeeInvitationNotification`, `VerifyEmailNotification`, `ResetPasswordNotification`, `MobileVerificationCodeNotification`.

### 1.4 API surface ([`routes/api.php`](routes/api.php:342), all authenticated `api/v1`)

- `GET /notifications` → list. Query params: `filter` = `unread` | `read` | none (default all), `per_page` (default 15, min 1, max 100), `page`. Response: `{ notifications: [...], unread_count, meta: { current_page, last_page, per_page, total } }`.
  - `unread_count` is computed from the **full unread set** (`$user->unreadNotifications()->count()`), independent of the current filter, so the header badge stays correct on any tab.
- `POST /notifications/read-all` → marks all unread as read. Returns `null`.
- `POST /notifications/{notification}/read` → marks one as read. Returns the updated notification resource.
- `DELETE /notifications/{notification}` → deletes (archives) one. Returns `null`.
- **No show/details endpoint exists** — notification details ride inside the list payload's `data` array.
- `POST /device-tokens` → register a device token (201, returns `DeviceTokenResource`). Body: `token` (required, ≤512), `platform` (required `in:ios,android,web`), `device_name`/`app_version`/`os_version` (nullable).
- `DELETE /device-tokens` → unregister. Body: `token`.

### 1.5 `NotificationResource` shape (per item in `notifications`)

| Key | Type | Source |
|---|---|---|
| `id` | string (uuid) | row id |
| `type` | string | `$this->data['type'] ?? class_basename($this->type)` — **payload type wins** |
| `title` | string\|null | `$this->data['title']` |
| `body` | string\|null | `$this->data['body']` |
| `data` | object | the full `toArray()` payload (includes `type`, `title`, `body` again, plus type-specific fields) |
| `read_at` | ISO 8601 string\|null | |
| `created_at` | ISO 8601 string\|null | |

### 1.6 FCM pipeline (mobile — no web-side integration)

- `FcmChannel` is registered in `AppServiceProvider` via `Notification::extend('fcm', ...)`.
- `send()` resolves active device tokens (`routeNotificationForFcm` override or `deviceTokens()->active()`), resolves the Firebase `Messaging` client **lazily** (returns null when unconfigured → delivery silently skipped), then sends one `CloudMessage` per token with `withNotification(title, body)` + `withData(type, ...)`.
- A `NotFound` exception from Firebase deactivates the token (`is_active = false`); other failures are logged.
- `LoginAction::syncDeviceToken` re-registers a device token on login (mobile client only).
- **Frontend (web SPA) has no device-token / FCM registration code** — a codebase search for `device-token|deviceToken|firebase|fcm|messaging|getToken|onMessage|vapid` returned no frontend usages (only a false positive on `activeBranchName` in [`EmployeeListPage.tsx`](resources/js/features/employees/pages/EmployeeListPage.tsx:269)). The web app consumes notifications exclusively via the REST API + Echo broadcast; `platform: 'web'` device tokens are supported by the backend but unused by the SPA.

---

## 2. Frontend Implementation (current state)

- **Types:** [`types/notification.ts`](resources/js/types/notification.ts) — `NOTIFICATION_TYPES`, `NotificationType`, `AppNotification`, `NotificationPagination`, `NotificationsPage`, `NOTIFICATION_FILTERS`, `NotificationFilter`.
- **Hook:** [`features/notifications/hooks/useNotifications.ts`](resources/js/features/notifications/hooks/useNotifications.ts) — `normalizeType`, `toActionUrl`, `mapNotification`, `mapMeta`, `fetchNotifications`, `fetchCurrentNotificationUser`, `markNotificationAsRead`, `markAllNotificationsAsRead`, `deleteNotification`, `useNotifications`.
- **Components:** [`NotificationBell.tsx`](resources/js/features/notifications/components/NotificationBell.tsx) (header popover, realtime), [`NotificationItem.tsx`](resources/js/features/notifications/components/NotificationItem.tsx) (compact + full rows, `NOTIFICATION_VISUALS`), [`NotificationsList.tsx`](resources/js/features/notifications/components/NotificationsList.tsx) (skeletons + empty states).
- **Page:** [`NotificationCenterPage.tsx`](resources/js/features/notifications/pages/NotificationCenterPage.tsx) — All/Unread/Read tabs, unread count header, Refresh + Mark-all-read, pagination, error state, sonner toasts.
- **Route:** `/notifications` is guarded by roles `['super_admin', 'company_admin', 'scheduler']` ([`AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx:430)).

### 2.1 Field mapping (backend → frontend)

| Backend (`NotificationResource`) | Frontend `AppNotification` | Notes |
|---|---|---|
| `id` | `id` | string, direct |
| `type` (payload) → `normalizeType()` | `type` (`NotificationType`) | see §2.2 |
| `data.title` ?? `title` | `title` | fallback `'Notification'` |
| `data.body` ?? `body` | `message` | fallback `'You have a new notification.'` |
| `data` | `data` | full payload preserved |
| `read_at` | `isRead` (`Boolean(read_at)`) | |
| `created_at` | `timestamp` | used for relative time |
| — (derived) | `actionUrl` | see §2.3 |

### 2.2 `normalizeType` mapping (aligned with every real database-channel type)

| Backend `data['type']` | Frontend `NotificationType` |
|---|---|
| `shift.assigned`, `shift_assigned` | `shift_assigned` |
| `leave_request.submitted`, `leave_requested` | `leave_requested` |
| `leave_request.approved`, `leave_approved` | `leave_approved` |
| `leave_request.rejected`, `leave_rejected` | `leave_rejected` |
| `billing.trial_ending`, `billing.trial_expired`, `billing.subscription_renewal_reminder`, `billing.subscription_activated` | `billing_alert` |
| anything else (incl. `roster_published`, `roster_updated`, unknown broadcast types) | `system_alert` |

No notification types were invented — every value in `NOTIFICATION_TYPES` corresponds to a type the backend actually emits through the database channel. `system_alert` remains a documented fallback for roster (out of scope) and any future/unknown types.

### 2.3 `toActionUrl` (deep-link targets)

| `NotificationType` | Target |
|---|---|
| `leave_requested` / `leave_approved` / `leave_rejected` (with `leave_request_id`) | `/leave-requests/{id}` |
| `shift_assigned` (with `shift_id`) | `/shifts` (fallback `/rosters`) |
| `billing_alert` | `/subscription` |
| `system_alert` | none (row not clickable) |

The backend billing notifications ship an `action_url` in their `data` payload (`/companies/{id}/subscriptions`), but that path is **not a route in this SPA**. The real company_admin subscription self-service dashboard is `/subscription` ([`AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx:405)); billing notifications are only ever sent to `company_admin`, so the frontend maps them to `/subscription`.

---

## 3. Fixes Applied (frontend only)

### M-01 — Distinct `billing_alert` category for real backend billing notifications

The backend emits **four** billing notification types through the database channel (`billing.trial_ending`, `billing.trial_expired`, `billing.subscription_renewal_reminder`, `billing.subscription_activated`) to `company_admin` users. The frontend collapsed all of them into the generic `system_alert`, losing the distinct "Billing" identity and giving them the wrong (warning/alert) visual.

**Changes:**
- [`types/notification.ts`](resources/js/types/notification.ts:3) — added `'billing_alert'` to `NOTIFICATION_TYPES`.
- [`useNotifications.ts`](resources/js/features/notifications/hooks/useNotifications.ts:79) — `normalizeType` now maps the 4 `billing.*` payload types to `billing_alert`.
- [`NotificationItem.tsx`](resources/js/features/notifications/components/NotificationItem.tsx:47) — added a `billing_alert` entry to `NOTIFICATION_VISUALS` (CreditCard icon, `bg-info/10 text-info` tint, "Billing" label).

### M-02 — Action deep-link for billing notifications

The frontend's `toActionUrl` ignored the billing payload's `action_url`. Because the backend target (`/companies/{id}/subscriptions`) is not an SPA route and billing notifications go only to `company_admin`, `billing_alert` now deep-links to `/subscription`.

**Changes:**
- [`useNotifications.ts`](resources/js/features/notifications/hooks/useNotifications.ts:113) — `toActionUrl` returns `/subscription` for `billing_alert`.

### Verified (no change needed)

- **Read/unread state**: `isRead = Boolean(read_at)`; unread rows show an unread dot, `bg-accent` tint, and an inline mark-as-read action. ✓
- **Mark as read**: `POST /notifications/{id}/read` with optimistic cache update + unread-count decrement. ✓
- **Mark all as read**: `POST /notifications/read-all` with optimistic cache update (`unreadCount = 0`). ✓
- **Delete/archive**: `DELETE /notifications/{id}` with optimistic cache update (removes row, decrements unread count and `meta.total`). ✓
- **Unread count**: `unread_count` from the API; 99+ cap in the header badge. ✓
- **Notification details**: no backend details endpoint exists; details ride in the list `data` payload and are surfaced as `title`/`message`. ✓
- **Filters**: `all`/`unread`/`read` map to the backend `filter` query param. ✓
- **Pagination**: `page`/`per_page` sent to the API; `meta` drives Prev/Next and "Page x of y". ✓
- **Realtime**: private channel `App.Models.User.{id}` → `channel.notification()` invalidates all notification queries (header bell only). ✓
- **FCM frontend integration**: none exists in the SPA (see §1.6) — the web app uses REST + Echo; nothing to fix or add. ✓

---

## 4. Gaps / Documented Discrepancies (intentionally left as-is)

| # | Discrepancy | Reason |
|---|---|---|
| G-01 | Roster notification types (`roster_published`, `roster_updated`) render as generic `system_alert`. | **Roster is explicitly out of scope** for this alignment task. When roster alignment is tackled, these should get distinct types/icons (mirroring `RosterChangeAction` / `ROSTER_CHANGE_ACTION_LABELS` in [`types/roster-management.ts`](resources/js/types/roster-management.ts:45)). |
| G-02 | Billing `action_url` in the payload (`/companies/{id}/subscriptions`) is not honored verbatim; `billing_alert` deep-links to `/subscription` instead. | The backend URL is not an SPA route. `/subscription` is the real company_admin subscription dashboard. |
| G-03 | `system_alert` remains a catch-all for any unknown type. | Backend `NotificationResource` falls back to `class_basename($this->type)` when `data['type']` is missing, which is a non-canonical value; mapping every conceivable class name is not feasible. |

---

## 5. Verification

- `npx tsc --noEmit` → **exit 0** (no TypeScript errors).
- `npx vite build` → **success** (3859 modules transformed, built in ~42s; only the pre-existing chunk-size warning).
- `php artisan test --filter "NotificationTest"` (via Laragon PHP 8.3.16) → **6 passed, 14 assertions**:
  - guest cannot register a device token
  - user can register a device token
  - registering same token reassigns it to current user
  - user can unregister a device token
  - approving leave notifies the employee user
  - user can list and read notifications

> Note: the default `php` on PATH resolves to XAMPP PHP 8.0.30, which fails Composer's platform check (project requires `>= 8.3`). Tests were run with `C:/laragon/bin/php/php-8.3.16-Win32-vs16-x64/php.exe`.
