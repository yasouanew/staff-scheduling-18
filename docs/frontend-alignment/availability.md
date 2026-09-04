# Employee Availability Frontend Alignment

> **Status:** Implemented — frontend aligned with the actual backend.
> **Scope:** Employee weekly availability: `employee_availabilities`, employees, users, companies. Trace: Availability UI → React state/form → API → Laravel → database → response → UI. Verify: Days, Start time, End time, Availability status, Employee ownership, Company ownership, Create, Update, Delete, Validation.
> **Method:** Backend/database/API is the **source of truth**. Every field was compared between backend (migrations, model, service, controller, requests, resource, routes, policy, tests) and frontend (types, hooks, grid lib, schemas, page, components). Only the frontend was changed — no backend code, migrations, business rules, or API payloads were touched. **Roster is out of scope.**
> **Reference docs:** `.roo/ui-ux.md` (architectural reference — not the ultimate source of truth), `docs/frontend-alignment/system-map.md` (M-01), `docs/task-11-12-availability-shift-templates-audit.md`, `docs/frontend-alignment/branches.md` (mock-removal precedent).

---

## 1. Backend Source of Truth (read-only reference)

### 1.1 `employee_availabilities` table + `EmployeeAvailability` model

| Column | Type / Validation | Notes |
|---|---|---|
| `id` | bigIncrements | |
| `employee_id` | foreignId → `employees`, `cascadeOnDelete` | Ownership |
| `day_of_week` | unsignedTinyInteger, `0`=Sunday … `6`=Saturday | **Sunday-first** index |
| `start_time` | `time`, nullable | Backend serialises as `HH:mm:ss` |
| `end_time` | `time`, nullable | |
| `is_available` | boolean, default `true` | `false` marks an explicit unavailable block |
| timestamps | | |

- **Unique index** `emp_day_start_unique` on `['employee_id', 'day_of_week', 'start_time']` — a day cannot hold two blocks starting at the same time.
- Model `$fillable`: `employee_id, day_of_week, start_time, end_time, is_available`.
- Model `casts`: `employee_id` integer, `day_of_week` integer, `is_available` boolean.
- `const DAYS = [0=>'Sunday' … 6=>'Saturday']`; `getDayNameAttribute()`.
- `scopeAvailable()` filters `is_available = true` (not used by the editor's full-week read).

### 1.2 API surface (all nested under authenticated `api/v1`)

- `GET /employees/{employee}/availabilities` → index, `authorize('view', $employee)`
- `POST /employees/{employee}/availabilities` → store, `authorize('update', $employee)`, 201
- `PUT /employees/{employee}/availabilities/sync` → **atomic week replace**, `authorize('update', $employee)`
- `GET /employees/{employee}/availabilities/{availability}` → show
- `PUT /employees/{employee}/availabilities/{availability}` → update
- `DELETE /employees/{employee}/availabilities/{availability}` → destroy

`show`/`update`/`destroy` additionally call `ensureBelongsToEmployee()` which `abort(404)` when `availability.employee_id !== employee.id`.

### 1.3 Validation

**Store** ([`StoreEmployeeAvailabilityRequest.php`](app/Http/Requests/EmployeeAvailability/StoreEmployeeAvailabilityRequest.php:24)):
- `day_of_week` — required, integer, `between:0,6`
- `start_time` — nullable, `date_format:H:i`
- `end_time` — nullable, `date_format:H:i`, `after:start_time`
- `is_available` — nullable, boolean

**Update** ([`UpdateEmployeeAvailabilityRequest.php`](app/Http/Requests/EmployeeAvailability/UpdateEmployeeAvailabilityRequest.php:24)): same rules with `day_of_week` marked `sometimes`.

**Sync** ([`SyncWeeklyAvailabilityRequest.php`](app/Http/Requests/EmployeeAvailability/SyncWeeklyAvailabilityRequest.php:26)):
- `availabilities` — **required, array, `min:1`** + nested rules (day_of_week, nullable `H:i` start/end, boolean `is_available`).

> ⚠️ The `min:1` on sync is the key constraint behind the "clear week" frontend gap (see §2.2). There is **no** endpoint that accepts an empty `availabilities` array; an employee with no availability is represented by **zero rows** in the table.

### 1.4 `EmployeeAvailabilityResource` (response shape)

`id`, `employee_id`, `day_of_week`, `day_name`, `start_time`, `end_time`, `is_available`, `employee` (whenLoaded), `created_at`, `updated_at` (ISO8601). The collection endpoints return a plain array of resources (`unwrapIndex` accepts `array | { data: array }`).

### 1.5 Permissions (no availability-specific policy exists)

`EmployeeAvailabilityController` authorises against the **employee** via `EmployeePolicy`:
- `view` — `employee.view` permission **and** `belongsToCompany` (the employee belongs to the user's company).
- `update` — `employee.edit` permission **and** `belongsToCompany`.
- `super_admin` — `before()` grants all abilities.

Frontend therefore needs no extra availability permission check beyond the employee's own view/update authorisation, which the real editor already inherits via `useEmployee`.

### 1.6 Backend tests (source of truth for expected behaviour)

[`tests/Feature/Employee/EmployeeAvailabilityTest.php`](tests/Feature/Employee/EmployeeAvailabilityTest.php) — 13 tests / 32 assertions, all passing:
list, create, day_of_week validation, end-after-start validation, sync, show, update, delete, 404-for-other-employee, 403-cross-company, 403-no-permission, and **sync requires at least one slot** (empty array → 422).

---

## 2. Frontend Before → After

### 2.1 M-01 CRITICAL — Mock `/availability` dashboard removed (P0)

**What was wrong:** The nav item `Availability` → `/availability` rendered a **mock dashboard** ([`AvailabilityDashboard.tsx`](resources/js/features/availability/pages/AvailabilityDashboard.tsx) — deleted) backed by an in-memory mock data layer ([`useAvailability.ts`](resources/js/features/availability/hooks/useAvailability.ts) — deleted) with hardcoded `AVAILABILITY_EMPLOYEES` (emp-001/002/004), `NETWORK_DELAY_MS` 500 setTimeout stubs, an in-memory leave-request store, its own `QueryClientProvider`, and legacy mock types ([`types/availability.ts`](resources/js/types/availability.ts) — deleted). It did **not** touch the `employee_availabilities` table or any real API. This replaced the real feature (documented as **M-01 CRITICAL** in [`docs/frontend-alignment/system-map.md`](docs/frontend-alignment/system-map.md:439), listed P0).

**What was changed (full removal, per confirmed approach):**

- **Deleted** the six mock/legacy files:
  - [`resources/js/features/availability/hooks/useAvailability.ts`](resources/js/features/availability/hooks/useAvailability.ts)
  - [`resources/js/features/availability/pages/AvailabilityDashboard.tsx`](resources/js/features/availability/pages/AvailabilityDashboard.tsx)
  - [`resources/js/features/availability/components/WeeklyAvailabilityGrid.tsx`](resources/js/features/availability/components/WeeklyAvailabilityGrid.tsx)
  - [`resources/js/features/availability/components/LeaveRequestModal.tsx`](resources/js/features/availability/components/LeaveRequestModal.tsx)
  - [`resources/js/features/availability/components/LeaveStatusBadge.tsx`](resources/js/features/availability/components/LeaveStatusBadge.tsx)
  - [`resources/js/types/availability.ts`](resources/js/types/availability.ts) (legacy types: `WEEKDAYS`, `AvailabilityBlock`, `WeeklyAvailability`, mock `LeaveRequest`/`LeaveType`/`LeaveStatus`)
- **Removed** the `/availability` route and its `AvailabilityDashboard` import from [`AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx).
- **Removed** the `Availability` nav item (and the now-unused `CalendarClock` import) from [`nav-items.ts`](resources/js/Components/layout/nav-items.ts).

**What was kept (real, backend-backed surfaces):**
- The real per-employee editor [`EmployeeAvailabilityPage.tsx`](resources/js/features/availability/pages/EmployeeAvailabilityPage.tsx) at `/employees/:id/availability`.
- Entry points into the real editor from the Employees directory:
  - the **Availability** column link in [`EmployeeListPage.tsx`](resources/js/features/employees/pages/EmployeeListPage.tsx:179) → `/employees/{id}/availability`
  - the **Manage availability** row action in [`EmployeeRowActions.tsx`](resources/js/features/employees/components/EmployeeRowActions.tsx:102)
- The real leave-requests feature, which has its **own** data layer ([`useLeaveRequests.ts`](resources/js/features/leave-requests/hooks/useLeaveRequests.ts)) and types ([`types/leave-request.ts`](resources/js/types/leave-request.ts), [`types/leave-type.ts`](resources/js/types/leave-type.ts)) — completely unaffected by the mock removal (verified: no lingering references).

### 2.2 Functional gap — "Clear week → Save" could not persist an empty week

**What was wrong:** The backend sync endpoint validates `availabilities` with `min:1` (enforced by `test_sync_requires_at_least_one_slot`). The editor's only persistence path was `handleSave` → `draftToSyncPayload(draft)` → `useSyncWeeklyAvailability`. After "Clear week" the draft is empty, so saving sent `{ availabilities: [] }` → **422 validation error** → the cleared state could never be saved. The `ClearWeekDialog` even told the user "Save the week to remove every block on the server" — a promise the app could not deliver.

**What was changed** ([`useEmployeeAvailability.ts`](resources/js/features/availability/hooks/useEmployeeAvailability.ts)) — `useSyncWeeklyAvailability` now handles the empty week without changing any API:

```ts
mutationFn: async (slots) => {
    // The sync endpoint rejects an empty payload (`min:1`), so a cleared
    // week is persisted by deleting each existing slot instead.
    if (slots.length === 0) {
        const current = queryClient.getQueryData<AvailabilitySlot[]>(
            AVAILABILITY_KEYS.byEmployee(employeeId),
        );
        if (current && current.length > 0) {
            await Promise.all(current.map((slot) => deleteSlot(employeeId, slot.id)));
        }
        return [];
    }
    return syncWeek(employeeId, slots);
},
```

- Empty week → each currently-persisted slot is `DELETE`d (individually), then the cache is set to `[]` via the existing `onSuccess`, which re-seeds the draft (no extra round trip).
- Non-empty week → unchanged atomic `PUT .../sync` path.
- The editor's `handleSave` needed **no change** — it already disables Save when `!isDirty` (empty draft after clearing is still dirty vs. a non-empty baseline), so a clear+save now succeeds.

### 2.3 Verified already-aligned (no changes needed)

Field-by-field comparison of the real editor against the backend found these already correct:

- **Days** — [`types/employee-availability.ts`](resources/js/types/employee-availability.ts:11) `DayOfWeek = 0|1|2|3|4|5|6` (Sunday=0) matches `day_of_week` `between:0,6`; `DAY_ORDER = [1..6,0]` is Monday-first display only; payload sends the raw backend index.
- **Start/End time** — domain uses `HH:mm`; transport maps `24:00` → `23:59` on the wire in both `toRequestBody` and `draftToSyncPayload` (matches `date_format:H:i`); response `HH:mm:ss` trimmed to `HH:mm` by `normalizeTime`.
- **Availability status** — `is_available` boolean ↔ `isAvailable` via `Boolean(dto.is_available ?? true)`; the editor exposes both "available" and explicit "unavailable" blocks.
- **Employee ownership** — every request is nested under `/employees/{employeeId}/availabilities`; `employeeId` is always sent (server assigns from route binding, not the body).
- **Company ownership** — inherited from `EmployeePolicy::belongsToCompany`; frontend relies on the server 403 and the editor's `isForbiddenError` guard.
- **Create / Update / Delete** — `useCreateAvailabilitySlot`, `useUpdateAvailabilitySlot`, `useDeleteAvailabilitySlot` exist with correct `POST`/`PUT`/`DELETE` paths; the page persists whole weeks via sync (the safest atomic path for a grid editor).
- **Validation** — `schemas.ts` enforces `0..6` days, `24:00` accepted as end-of-day, `endTime > startTime`, copy-to-days excluding the primary day; all consistent with backend rules.

---

## 3. API changes

**None.** No backend code, migrations, validation rules, resources, or routes were modified. The empty-week fix is entirely client-side (deletes existing rows to represent "no availability"), which is exactly how the backend already models an employee with no availability.

---

## 4. Files changed

| File | Change |
|---|---|
| [`resources/js/features/availability/hooks/useEmployeeAvailability.ts`](resources/js/features/availability/hooks/useEmployeeAvailability.ts) | Empty-week save now deletes persisted slots instead of hitting the `min:1`-guarded sync endpoint |
| [`resources/js/routes/AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx) | Removed `/availability` route + `AvailabilityDashboard` import |
| [`resources/js/Components/layout/nav-items.ts`](resources/js/Components/layout/nav-items.ts) | Removed `Availability` nav item + `CalendarClock` import |
| `resources/js/features/availability/hooks/useAvailability.ts` | **Deleted** (mock layer) |
| `resources/js/features/availability/pages/AvailabilityDashboard.tsx` | **Deleted** (mock dashboard) |
| `resources/js/features/availability/components/WeeklyAvailabilityGrid.tsx` | **Deleted** (mock grid) |
| `resources/js/features/availability/components/LeaveRequestModal.tsx` | **Deleted** (mock modal) |
| `resources/js/features/availability/components/LeaveStatusBadge.tsx` | **Deleted** (mock badge) |
| `resources/js/types/availability.ts` | **Deleted** (legacy mock types) |

---

## 5. Tests performed

- `npx tsc --noEmit` — ✅ passed (no type errors after removals + sync change).
- `npx vite build` — ✅ production build succeeded (3849 modules, no errors).
- `C:\laragon\bin\php\php-8.3.16-Win32-vs16-x64\php.exe vendor\bin\phpunit --filter "EmployeeAvailabilityTest"` — ✅ **OK (13 tests, 32 assertions)** — the backend contract (including `min:1` on sync) is unchanged and all availability behaviour is verified.

---

## 6. Remaining issues

- **`/availability` deep link:** Any saved bookmark to `/availability` now hits the app's fallback `NotFound` route. The nav no longer offers it; the real editor is reached from the Employees directory (column link or row action). A redirect route could be added later if desired, but it was intentionally not created to keep the route table free of a mock target.
- **Per-slot hooks unused by the page:** `useCreateAvailabilitySlot` / `useUpdateAvailabilitySlot` / `useDeleteAvailabilitySlot` remain exported (used by the empty-week fallback internally via `deleteSlot`) but the page itself still persists only through the atomic sync path. This is intentional and correct for a grid editor.
- **Roster integration:** Out of scope per the task brief; no roster functionality was modified or inspected for changes.
