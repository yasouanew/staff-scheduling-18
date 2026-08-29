# Roster Calendar Redesign — Implementation Spec

## Why

The current roster UX forces a manager to think in the *database's* shape: pick a
branch, pick a week, open a roster, then fill an employee × weekday matrix. A
company with 8 branches must repeat that 8 times a week — ~32 context switches a
month. Managers think in **calendar months**, so the roster page must open on a
month grid where a whole month of coverage is visible and editable in place.

---

## The blocking data-model conflict (resolved)

| Concept | Current DB shape |
| --- | --- |
| `rosters` | one row per **branch + week** (`branch_id`, `week_start`, `week_end`, `status`) |
| `shifts` | belongs to `roster_id` **and** denormalised `branch_id`, plus `date` |

A month-grid cell is **one calendar day across all branches**, so a cell maps to
*N* rosters (one per branch), not one. Creating a shift on 12 March therefore has
no unambiguous `roster_id`.

**Resolution — branch is chosen as step 1 of the Add Shift wizard.** The backend
then resolves `roster_id` by *find-or-create*: given `(company, branch, date)`,
snap the date to its ISO week (Mon–Sun) and reuse that branch's roster for the
week, creating it as `draft` when missing. This keeps the existing weekly roster
model intact — the month grid becomes a **projection over shifts**, and rosters
stay the unit of publishing/approval. No destructive migration required.

---

## Backend work required

1. **`RosterService::findOrCreateForDate(int $branchId, string $date): Roster`**
   Snap to ISO week via `Carbon::startOfWeek(Monday)` / `endOfWeek(Sunday)`,
   `firstOrCreate` on `(company_id, branch_id, week_start)` with `status: draft`.
   Must run inside a transaction and respect the company scope.

2. **`POST /v1/shifts/bulk`** — accepts `{ shifts: [...] }`.
   Paste-into-20-cells must not fire 20 requests. One transaction, one
   conflict-check pass, returns created shifts + per-item validation errors so
   partial success is reportable.

3. **`GET /v1/shifts` already supports** `branch_id`, `status`, `date_from`,
   `date_to` — the month grid uses this directly (`date_from`/`date_to` = the
   padded 6-week grid range). No new read endpoint needed, but ensure
   `per_page` can be raised or paging disabled for calendar range queries, since
   a 6-week window across all branches can exceed the default 15.

4. **Conflict checks on paste** — reuse `RosterConflictService` so pasted shifts
   surface `overtimeRisk` / `leaveConflict` / `doubleBooked` rather than silently
   creating illegal rosters (Fair Work exposure: 38h ordinary week, 10h day).

---

## Frontend architecture

```
features/rosters/
  lib/
    month-grid.ts        # pure: build padded 6×7 matrix, group shifts per day/branch
    clipboard.ts         # pure: copy payload → rebased shifts for a target date
  stores/
    useCalendarClipboard.ts   # copied cell payload + paste-armed state
    useCellSelection.ts       # multi-cell marquee/ctrl-click selection set
  components/
    CalendarToolbar.tsx       # ← prev/next · centre period label · month|week|day
    RosterMonthGrid.tsx       # 7 weekday columns × 5–6 week rows
    RosterMonthCell.tsx       # day number, shift chips, +/copy/paste, week drill-in
    ShiftChip.tsx             # branch name + status badge + edit/delete quick action
    AddShiftWizard.tsx        # step 1 branch → step 2 employees + times
  pages/
    RosterCalendarPage.tsx    # owns filters, view mode, cursor date
```

### Toolbar layout (as specified)

- **left** — `←` `→` arrows (step by month/week/day depending on view)
- **centre** — period label (`March 2026`, `9–15 Mar 2026`, `Thu 12 Mar 2026`)
- **right** — segmented control: **Month · Week · Day**

Keep `Today` next to the arrows; it is the single most-used control in every
mature scheduler and costs nothing.

### Filters

Two filters drive the grid: **Branch** and **Roster status**.

- `branch = all` → each cell lists **every branch's** shifts, chips labelled with
  the branch name and status. Chips collapse to `+N more` past 3 per cell so tall
  cells never break the grid rhythm.
- `branch = one` → cells show only that branch's shifts, so chips can drop the
  branch label and show **time + employee** instead (higher information density
  where it is unambiguous).

### Cell interactions

| Control | Behaviour |
| --- | --- |
| **+** | Opens the Add Shift wizard for that date. **Disabled** when every branch in scope already has shifts that day (`allBranchesCovered`), with a tooltip explaining why — never a dead control with no explanation. |
| **copy** | Copies the cell's shift set into the clipboard store; **arms paste on every other cell**. |
| **paste** | Writes the copied shifts onto the target date, preserving each shift's own branch, employee, and times. |
| **drag & drop** | Move a single chip to another date (same branch), optimistic + rollback on failure. |
| **marquee select** | Drag across cells (or ctrl/⌘-click) to select many, then paste once into all of them — the bulk endpoint keeps this a single request. |
| **row click / chevron** | Opens that ISO week as the **Week overview** (`RosterDetailPage`). |

### Add Shift wizard

**Step 1 — Branch.** Searchable branch list (required). Pre-selected and
skippable when the page filter is already a single branch, so the common path
stays one step.

**Step 2 — Employees + times.** Search box over a scrollable employee list;
checkbox left, start/end time right. Time inputs are **disabled until the row is
selected**, then pre-filled from the employee's `Availability` for that weekday
and left editable. Employees on approved leave or already booked that day are
shown with a warning affordance rather than hidden — the manager keeps authority,
but is never surprised.

Save creates one shift per selected employee, all landing as `draft`/`scheduled`
in that branch's weekly roster, then the chips appear in the cell.

---

## UX requirements (non-negotiable per house rules)

- Loading (skeleton grid), empty, error + retry, and permission states.
- Every destructive action (delete chip, overwrite paste) confirms first.
- Every mutation shows a success toast; paste reports `n created, m skipped`.
- Keyboard: cells focusable, arrows move focus, `c` copy, `v` paste, `Enter` add.
- Mobile: month grid degrades to an **agenda list** per the responsive rules —
  a 7-column month grid is unusable under ~640px.

---

## Publication layer (draft vs sent)

A month cell answers *"is this branch covered?"* but coverage alone is a
half-truth: a fully staffed **draft** week is invisible to employees, so nobody
turns up. The calendar therefore treats publication as first-class, not as a
detail buried in the roster detail page.

`ShiftResource` exposes the owning roster's `status` / `published_at`, which the
frontend folds into three places:

| Surface | What it shows |
| --- | --- |
| `BranchDayChip` | A `Draft` / `Sent` marker per branch-day, with draft chips tinted neutral-grey and published chips green, plus inline edit + delete controls. |
| `CalendarPublicationSummary` | Four cards over the visible range: shifts in view, **draft not sent** (warning, with the number of weeks awaiting publication), published (with % share), and unfilled shifts (danger). |
| `BranchDayEditorDialog` | Staffing (searchable employee select + times per shift) and a visibility radio: *keep as draft* or *publish to staff*. |

Two rules are enforced in the UI because they are irreversible in the domain:

1. **Publish happens last.** `handleBranchDaySave` writes the shift edits first
   and only then calls `POST /rosters/{id}/publish`; if any edit fails the
   publish is abandoned, so staff are never notified about a roster that is
   about to change.
2. **Publishing cannot be undone from the calendar.** The *keep as draft* option
   is disabled once a roster is published, and the confirm copy states that
   publishing covers the branch's whole ISO week — not just the clicked day.

Clearing a branch-day deletes several shifts at once, so its confirmation names
the exact count and adds an extra warning when the roster is already published
and staff would lose shifts they have been told about.

---

## Staging


1. **Grid shell** — types, `month-grid.ts`, toolbar, month grid, cells, filters,
   week drill-down. Read-only, real data.
2. **Add Shift wizard** + `findOrCreateForDate` backend.
3. **Clipboard** — copy/paste single cell, then multi-select + bulk endpoint.
4. **Drag & drop** + conflict overlays.

Each stage ends green on `npx tsc --noEmit` and `npm run build`.
