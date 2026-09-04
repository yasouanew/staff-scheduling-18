# Plans & Features Frontend Alignment

> **Status:** Implemented — frontend aligned with the actual backend.
> **Scope:** Super-admin Plan catalogue (`/super-admin/plans`), Plan create/edit form, feature assignment UI, plan list/delete/deactivate handling.
> **Method:** Backend/database/API is the **source of truth**. Every Plan/Feature field was compared between backend (migrations, models, requests, controller, service, resource, routes) and frontend (types, hooks, form, table, page). Only the frontend was changed — no backend code, migrations, or business rules were touched.

---

## 1. Backend Source of Truth (read-only reference)

### 1.1 `plans` table + `Plan` model fillable fields

| Field | Validation (`Store`/`Update`) | Notes |
|---|---|---|
| `name` | required, string, max:255 | |
| `slug` | required, unique; auto-generated from `name` via `Str::slug` | sent as `undefined` → backend generates |
| `price_monthly` | required, numeric, min:0 | decimal(10,2) |
| `price_six_monthly` | nullable, numeric, min:0 | decimal(10,2) |
| `price_yearly` | required, numeric, min:0 | decimal(10,2) |
| `stripe_monthly_price_id` | nullable, string, max:255 | |
| `stripe_six_monthly_price_id` | nullable, string, max:255 | |
| `stripe_yearly_price_id` | nullable, string, max:255 | |
| `stripe_product_id` | nullable, string, max:255 | **was missing from frontend `BillingPlan`/form** |
| `max_employees` | nullable, integer, min:1 | null = unlimited; **was missing from form** |
| `max_branches` | nullable, integer, min:1 | null = unlimited; **was missing from form** |
| `features` | nullable, array of strings | jsonb column; 14 known keys + custom strings |
| `is_active` | boolean | default true |

Additional model fillable fields NOT in request validation (silently ignored by API, not surfaced in UI): `description`, `currency`, `sort_order`, `metadata`. The frontend does not send these (correct — backend would ignore them).

### 1.2 Features system (two parallel mechanisms)

1. **`plans.features` (jsonb string array)** — populated by `StorePlanRequest`/`UpdatePlanRequest` → `PlanService::create/update`. Returned by `PlanResource.features`. This is the surface the super-admin Plan UI reads and writes.
2. **`plan_features` pivot table** (`plan_id`, `feature_id`, `is_enabled`, `limit_value`, `configuration`) — populated by `PlanFeatureSeeder`; consumed by `EntitlementService` for company-level feature gating. **Not exposed** through the super-admin Plan CRUD API.

The 14 known feature keys come from `App\Enums\Feature` (the single source of truth): `roster`, `employee_management`, `branch_management`, `leave`, `availability`, `notifications`, `shift_swap`, `advanced_reporting`, `analytics`, `audit_log`, `multi_branch`, `api_access`, `advanced_permissions`, `payroll_integration`.

### 1.3 API surface

- `GET /plans` → `PlanResource` paginated (`subscriptions_count` via `withCount`)
- `POST /plans` → `StorePlanRequest`
- `PUT /plans/{plan}` → `UpdatePlanRequest`
- `DELETE /plans/{plan}` → throws 422/`RuntimeException` when the plan has active/trialing subscriptions

---

## 2. Frontend Before → After

### 2.1 [`resources/js/types/billing.ts`](resources/js/types/billing.ts)

**Added** `stripeProductId: string | null` to `BillingPlan` (line 15) — the backend always returns `stripe_product_id` from `PlanResource`. `PlanInput` already contained `stripeProductId`.

### 2.2 [`resources/js/features/billing/hooks/useBilling.ts`](resources/js/features/billing/hooks/useBilling.ts)

- **Added** `stripe_product_id: string | null` to `PlanDto` (line 13) — mirrors `PlanResource`.
- **Added** `stripeProductId: d.stripe_product_id ?? null` to `mapPlan` (line 18) — maps the new DTO field into `BillingPlan`.
- `planPayload` (line 22) already serialised `stripe_product_id` from `PlanInput`; unchanged.

### 2.3 [`resources/js/features/billing/components/PlanForm.tsx`](resources/js/features/billing/components/PlanForm.tsx)

- **Added** `Max employees` and `Max branches` inputs (optional integers, blank = unlimited) — previously only surfaced in the table, not editable.
- **Added** `Stripe product ID` input — previously mapped to `null` on edit and never editable.
- **Feature assignment upgraded** from a raw free-text textarea to a **checkbox picker of the 14 known backend feature keys** (mirroring `App\Enums\Feature` labels), plus a smaller **"Custom feature keys"** textarea for any additional strings the backend accepts (`features.*` = string, max:255). Editing an existing plan keeps unknown/legacy entries in the custom textarea, so nothing is lost on round-trip.
- Preserved all existing fields, page design (Radix Dialog + same `field`/button styles) and the create/edit dual-mode behaviour.

### 2.4 [`resources/js/features/billing/components/PlansTable.tsx`](resources/js/features/billing/components/PlansTable.tsx)

- No changes required — it already renders all backend-supported columns (plan name + feature count, monthly/6-month/yearly prices, employee/branch limits with `Unlimited`, subscriber count, active/inactive status badge, Edit/Delete actions).

### 2.5 [`resources/js/features/billing/pages/PlansPage.tsx`](resources/js/features/billing/pages/PlansPage.tsx)

- No changes required — create/edit/delete already route through `useCreatePlan`/`useUpdatePlan`/`useDeletePlan`, which invalidate `BILLING_KEYS.plans` on success so the list refreshes after every mutation. Delete confirms via `window.confirm` and surfaces the backend's "has active subscriptions" error through `getApiErrorMessage`.

---

## 3. Field-by-field comparison (create & edit)

| Backend field | Was in frontend? | Action |
|---|---|---|
| `name` | Yes | OK (unchanged) |
| `slug` | Yes | OK — blank on create lets backend auto-generate |
| `price_monthly` | Yes | OK |
| `price_six_monthly` | Yes | OK |
| `price_yearly` | Yes | OK |
| `stripe_monthly_price_id` | Yes | OK |
| `stripe_six_monthly_price_id` | Yes | OK |
| `stripe_yearly_price_id` | Yes | OK |
| `stripe_product_id` | Payload only (not type/form) | **Fixed** — added to `BillingPlan`, `PlanDto`, `mapPlan`, and form |
| `max_employees` | Type only (not form) | **Fixed** — added form input (blank = unlimited) |
| `max_branches` | Type only (not form) | **Fixed** — added form input (blank = unlimited) |
| `features` | Yes (free text) | **Improved** — checkbox picker for the 14 known keys + custom textarea |
| `is_active` | Yes | OK — drives deactivate without delete |
| `description`/`currency`/`sort_order`/`metadata` | No | Intentionally omitted — not accepted by request validation (backend ignores) |

**No obsolete frontend-only fields were found.** Every field the form previously sent (`name`, `slug`, prices, stripe ids, features, `is_active`) is accepted by the backend.

---

## 4. Verification

### 4.1 TypeScript / build

- `npx tsc --noEmit` — clean.
- `npm run build` (tsc + vite) — succeeds (only a pre-existing chunk-size warning).

### 4.2 Backend tests (API contract the frontend targets)

- `PlanManagementTest` — 9 passed: guest blocked, super-admin list/create/update/delete, name required, slug unique, company_admin view-only, employee blocked.
- `FeatureEntitlementTest` — 9 passed: entitlements return plan + features, feature middleware gating, branch-scoped features.
- `SubscriptionPlanTest` — 27 passed: full self-service subscription lifecycle incl. plan catalogue.
- Full `tests/Feature/Billing` suite — **186 passed (570 assertions)**.

### 4.3 Flow coverage

- **Plan List → Create → Save → List refresh:** `useCreatePlan` POSTs `planPayload` to `/plans` and invalidates `BILLING_KEYS.plans` on success → list refetches. Verified by `super admin can create a plan` test and the mutation's `onSuccess` invalidation.
- **Plan List → Edit → Save → List refresh:** `useUpdatePlan` PUTs to `/plans/{id}` and invalidates `BILLING_KEYS.plans` on success → list refetches. Verified by `super admin can update a plan` test.
- **Delete:** `useDeletePlan` DELETEs `/plans/{id}`; plans with active subscriptions are rejected by the backend and surfaced via `getApiErrorMessage`.
- **Deactivate:** set `is_active` = false in the form ("Available for subscription" unchecked) — no backend rule blocks it.

---

## 5. Files changed

| File | Change |
|---|---|
| `resources/js/types/billing.ts` | Added `stripeProductId` to `BillingPlan` |
| `resources/js/features/billing/hooks/useBilling.ts` | Added `stripe_product_id` to `PlanDto`; mapped in `mapPlan` |
| `resources/js/features/billing/components/PlanForm.tsx` | Added max-employees/max-branches/Stripe-product inputs; replaced free-text features with checkbox picker (14 known keys) + custom textarea |

No backend files, migrations, or business rules were modified.
