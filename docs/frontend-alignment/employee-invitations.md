# Employee Invitation UI Alignment

> **Status:** Implemented — Employee Invitation UI aligned with the actual backend.
> **Scope:** Employee invitation workflow only: create/send, re-send, **revoke/cancel**, accept (web channel), mobile onboarding, invitation state, expiry and status surfacing. **Roster is out of scope.**
> **Method:** Backend/database/API is the **source of truth**. Every invitation field was compared between backend (`employee_invitations` migration, `EmployeeInvitation` model, `EmployeeInvitationController`, `InvitationService`, `SendInvitationRequest`, `EmployeeInvitationResource`, `InvitationController`, guest request classes, routes, notifications) and frontend (`useInvitation.ts`, `useEmployees.ts` send/revoke hooks, `SendInviteModal`, `EmployeeRowActions`, `RevokeInviteDialog`, `AcceptInvitationPage`, `DownloadAppPage`, `AppRoutes`, `auth/schemas.ts`, `types/employee.ts`). Only the frontend was changed — no backend code, migrations, or business rules were touched.

---

## 1. Backend Source of Truth (read-only reference)

### 1.1 `employee_invitations` table + `EmployeeInvitation` model

One ledger row **per user** (`unique('user_id')`), reused on every re-send. Secrets are stored as SHA-256 hashes (`token_hash`, `code_hash`, `setup_token_hash`) and never exposed.

| Column | Purpose | Frontend handling |
|---|---|---|
| `company_id` | Cascade-owned by the company | Never sent by the frontend |
| `employee_id` | Nullable, null-on-delete | Never sent by the frontend |
| `user_id` | Unique; links to the login account | Never sent by the frontend |
| `invited_by` | Admin who sent | Not mapped (not rendered) |
| `email` | Indexed; the invited address | Read via `dto.email` |
| `role` | `company_admin` / `scheduler` / `employee` | Read via `dto.role` |
| `channel` | `web` or `mobile`, derived from role | Read via `dto.channel` |
| `token_hash`, `expires_at` | Web channel: emailed link (default 48 h) | `dto.expires_at` → `expiresAt` |
| `code_hash`, `code_expires_at`, `code_attempts` | Mobile channel: one-time code (15 min, 5 attempts) | Not surfaced in the directory UI |
| `setup_token_hash`, `setup_token_expires_at` | Mobile channel: proof a code was verified (30 min) | Not surfaced in the directory UI |
| `send_count`, `last_sent_at` | Audit trail for re-sends | `dto.last_sent_at` → `lastSentAt` |
| `accepted_at` | Set when a password is chosen; makes invitation inert | Backend derives `status` from it |
| `created_at`, `updated_at` | Timestamps | Not rendered |

Model helpers used by the API: `WEB_ROLES = ['company_admin','scheduler']`, `channelForRole()` (employee → `mobile`, else `web`), `isAccepted()` (`accepted_at !== null`), `isExpired()` (`expires_at` past), `isPending()` (not accepted && not expired), `scopePending`.

### 1.2 `EmployeeInvitationResource` (what the API returns)

`id`, `employee_id`, `user_id`, `email`, `role`, `channel`, `status` (`accepted` if `accepted_at !== null`, else `expired` if `isExpired()`, else `pending`), `expires_at` (ISO), `last_sent_at` (ISO), `send_count`, `accepted_at` (ISO), `invited_by` (`whenLoaded('inviter')`).

### 1.3 Admin endpoints (`company.access`, `EmployeePolicy@update`)

- `POST /employees/{employee}/invitation` → `SendInvitationRequest` → `InvitationService::invite` → `201` `EmployeeInvitationResource` + channel-specific message.
- `DELETE /employees/{employee}/invitation` → `InvitationService::revoke` → `200` `{ success, message }`; **404** when there is no invitation to revoke.

`SendInvitationRequest` rules: `role` required `in:company_admin,scheduler,employee`; **`email` nullable** (optional when the employee already has a linked account), `email` `max:255`, unique on `users.email` ignoring the employee's own `user_id`; email lowercased/trimmed in `prepareForValidation`.

`InvitationService::invite` is **idempotent on the user** — it reuses the ledger row, rotates every secret, increments `send_count`, stamps `last_sent_at`, creates the login account when missing, and emails the channel-appropriate notification.

`InvitationService::revoke` `forceFill`s `token_hash`, `expires_at`, `code_hash`, `code_expires_at`, `code_attempts`, `setup_token_hash`, `setup_token_expires_at` to `null` — the ledger row and its audit trail are kept.

### 1.4 Guest endpoints (public, throttled)

| Endpoint | Body / query | Notes |
|---|---|---|
| `GET /invitations` | `token`, `email` | Preview → `{email, name, role, company_name, expires_at}`. 10 req/min. |
| `POST /invitations/accept` | `token`, `email`, `password`, `password_confirmation` | Sets first password; single-use. 6 req/min. |
| `POST /invitations/mobile/request-code` | `email` | → `expires_in_minutes`. Same 200 whether or not the address is registered. 6 req/min. |
| `POST /invitations/mobile/verify-code` | `email`, `code` | → `setup_token`, `expires_in_minutes`. 10 req/min. |
| `POST /invitations/mobile/complete-setup` | `email`, `setup_token`, `password`, `password_confirmation` | → activated user. 6 req/min. |
| `GET /mobile-app/links` | — | → `ios_url`, `android_url`. |

Password rule (web accept + mobile complete-setup): `Password::min(8)->letters()->mixedCase()->numbers()->symbols()`.

Emailed URLs: `WebInvitationNotification` → `{frontend_url}/accept-invitation?token=…&email=…`; `MobileInvitationNotification` → `{frontend_url}/download-app?email=…`. Both match `AppRoutes` routes exactly.

---

## 2. Frontend Before → After

### 2.1 Confirmed-already-aligned (no change needed)

- **Accept flow** — [`useInvitation.ts`](resources/js/features/invitations/hooks/useInvitation.ts): `useInvitationPreview` (GET `/invitations` with `token`+`email`), `useAcceptInvitation` (POST `/invitations/accept` with `password_confirmation`), `useMobileAppLinks` (GET `/mobile-app/links`) all match the backend payloads/responses 1:1.
- **Accept page** — [`AcceptInvitationPage.tsx`](resources/js/features/invitations/pages/AcceptInvitationPage.tsx): guards for missing params / loading / error, reads `company_name` + `role` + `email` from the preview, enforces the strong-password checklist via `resetPasswordSchema` (min 8, upper, lower, number, symbol) which matches the backend `Password` rule, redirects to `/login` on success.
- **Download app page** — [`DownloadAppPage.tsx`](resources/js/features/invitations/pages/DownloadAppPage.tsx): reads `email` param, shows store links from `useMobileAppLinks` or a "coming soon" fallback.
- **Routes** — [`AppRoutes.tsx`](resources/js/routes/AppRoutes.tsx): `/accept-invitation` and `/download-app` are public, matching the emailed URLs.
- **Send payload** — [`useEmployees.ts`](resources/js/features/employees/hooks/useEmployees.ts) `sendInvitation` sends `{ role, email }` and omits `email` when blank (so the backend keeps the account's existing address) — matching the nullable `email` rule. It maps the response's `channel` and `email` for an accurate toast.

### 2.2 [`resources/js/types/employee.ts`](resources/js/types/employee.ts)

- **No type changes required.** `InvitationStatus` (`none | pending | expired | accepted`), `InvitationChannel` (`web | mobile`), `EmployeeInvitation` (`status`, `channel`, `role`, `email`, `lastSentAt`, `expiresAt`), `SendInvitationInput` (`role`, `email`) and `SendInvitationResult` (`channel`, `email`) already mirror the backend resource fields actually surfaced by the directory.

### 2.3 [`resources/js/features/employees/hooks/useEmployees.ts`](resources/js/features/employees/hooks/useEmployees.ts) — **revoke added**

- **Added** `revokeInvitation(employeeId)` transport → `DELETE /employees/{employeeId}/invitation` (awaits `apiClient.delete`, resolves to `void`).
- **Added** `useRevokeInvitation(): UseMutationResult<void, Error, string>` — mutationFn `revokeInvitation`, `onSuccess` invalidates `EMPLOYEES_KEYS.all` (matching the `useSendInvitation` pattern) so the directory row, status column and menu labels refresh after a revoke.

### 2.4 [`resources/js/features/employees/components/EmployeeRowActions.tsx`](resources/js/features/employees/components/EmployeeRowActions.tsx) — **revoke item added**

- **Added** `onRevokeInvite: (employee: Employee) => void` to `EmployeeRowActionsProps`.
- **Added** a **"Revoke invite"** destructive menu item (icon `UserX`, `text-danger focus:bg-danger/10`), rendered **only when `employee.invitation?.status === 'pending'`** — i.e. matching the backend's `isPending()` semantics (not accepted && not expired). It is hidden for `accepted` (person already onboarded) and `expired` (no live secret left to cancel), and absent when there is no invitation.

### 2.5 [`resources/js/features/employees/components/RevokeInviteDialog.tsx`](resources/js/features/employees/components/RevokeInviteDialog.tsx) — **new**

- New confirmation dialog (`AlertDialog`) shown for the selected employee, mirroring the existing `EditEmployeeModal` destructive-confirm pattern.
- On confirm it calls `useRevokeInvitation().mutateAsync(employee.id)`, shows a success toast ("Invitation revoked — the link or code emailed to {name} no longer works."), and closes. On error it surfaces `getApiErrorMessage` via a toast.
- Loading state on the confirm button while the request is in flight; destructive action is gated behind the confirmation, per the UX rules.

### 2.6 [`resources/js/features/employees/pages/EmployeeListPage.tsx`](resources/js/features/employees/pages/EmployeeListPage.tsx) — **wired up**

- **Added** `employeeToRevoke` state + `handleRevokeInvite` callback.
- **Extended** `EmployeeRowHandlers` and `buildColumns` with `onRevokeInvite`, passed through to `EmployeeRowActions`.
- **Rendered** `<RevokeInviteDialog employee={employeeToRevoke} onOpenChange={…} />` alongside the existing `EditEmployeeModal` / `SendInviteModal`, clearing the selection on close.

### 2.7 [`resources/js/features/employees/components/SendInviteModal.tsx`](resources/js/features/employees/components/SendInviteModal.tsx) — **reviewed, left as-is**

- The zod schema requires `email` (`min(1)`) while the backend `email` is **nullable**. This is a strictness difference, **not a functional mismatch**: the modal pre-fills the field from `employee.invitation?.email ?? employee.email` and the transport omits blank emails, so the backend's nullable path is still reachable (send with the account's existing address). Relaxing the schema to optional would hide a genuine "which address do I email?" decision, so it was intentionally kept required. **Documented as a deliberate deviation — no code change.**

---

## 3. Comparison Summary (verify checklist)

| Requirement | Backend | Frontend | Verdict |
|---|---|---|---|
| Create invitation | `POST /employees/{employee}/invitation` | `useSendInvitation` → `SendInviteModal` | Aligned |
| Email/address field | `SendInvitationRequest.email` nullable | `SendInviteModal` pre-fills; transport omits blank | Aligned (schema stricter by design — see §2.7) |
| Employee relationship | `employee_id` nullable; `unique user_id` | Mapped into the employee row | Aligned |
| Token/state | Hashed secrets, single-use | Never exposed; status-driven UI | Aligned |
| Expiration | `expires_at` (48 h web) → `status: expired` | `expiresAt` mapped; `status` badge drives menu | Aligned |
| Invitation status | `pending / expired / accepted` | `InvitationStatus` union + `mapInvitation` | Aligned |
| Resend | Same endpoint, idempotent, rotates secrets | "Resend invite" label + same modal | Aligned |
| **Cancel (revoke)** | `DELETE /employees/{employee}/invitation` (404 if none) | **Added** `useRevokeInvitation` + "Revoke invite" menu item + `RevokeInviteDialog` | **Fixed** (was missing) |
| Accept flow (web) | `GET /invitations` + `POST /invitations/accept` | `useInvitationPreview` + `useAcceptInvitation` + `AcceptInvitationPage` | Aligned |
| Mobile onboarding | request-code → verify-code → complete-setup | `DownloadAppPage` + `useMobileAppLinks` | Aligned |

No unsupported fields were being sent, and no backend-supported invitation fields were missing from the send/revoke/accept surfaces after this change. No invitation functionality was invented — every new UI element maps to a real backend endpoint.

---

## 4. Verification

- `npx tsc --noEmit` → exit 0.
- `npx vite build` → exit 0 (3855 modules transformed).
- `phpunit --filter EmployeeInvitationTest` → **OK (12 tests, 65 assertions)**, covering both journeys end-to-end, token rotation on re-send, expiry, single-use, attempt counting, email enumeration safety, **revocation**, and cross-company access.

---

## 5. Files Changed

- [`resources/js/features/employees/hooks/useEmployees.ts`](resources/js/features/employees/hooks/useEmployees.ts) — added `revokeInvitation` + `useRevokeInvitation`.
- [`resources/js/features/employees/components/EmployeeRowActions.tsx`](resources/js/features/employees/components/EmployeeRowActions.tsx) — added `onRevokeInvite` prop + "Revoke invite" menu item.
- [`resources/js/features/employees/components/RevokeInviteDialog.tsx`](resources/js/features/employees/components/RevokeInviteDialog.tsx) — new confirmation dialog.
- [`resources/js/features/employees/pages/EmployeeListPage.tsx`](resources/js/features/employees/pages/EmployeeListPage.tsx) — wired `employeeToRevoke` / `handleRevokeInvite` / `onRevokeInvite` / `<RevokeInviteDialog>`.
