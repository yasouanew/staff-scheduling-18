# Team invitations

The team page (`/employees`) exposes a three-dot menu on every row with two
actions: **Edit employee** and **Send invite** (labelled *Resend invite* once one
is outstanding, plus *Revoke invite* while it is still pending).

The invited **role decides which onboarding journey the person is sent down**, so
one button serves both audiences:

| Invited role                  | Channel  | Journey |
| ----------------------------- | -------- | ------- |
| `company_admin`, `scheduler`  | `web`    | Emailed link → set password in this web app → sign in |
| `employee`                    | `mobile` | Emailed "download the app" link → verify by code in the app → set password |

---

## Data model

`employee_invitations` holds exactly **one row per user**, reused on every
re-send. Secrets are stored as SHA-256 hashes, never in plain text — a database
leak cannot be replayed as a login.

| Column | Purpose |
| ------ | ------- |
| `token_hash`, `expires_at` | Web channel: the emailed link (default 48 h) |
| `code_hash`, `code_expires_at`, `code_attempts` | Mobile channel: the one-time code (default 15 min, 5 attempts) |
| `setup_token_hash`, `setup_token_expires_at` | Mobile channel: proof a code was verified (default 30 min) |
| `send_count`, `last_sent_at` | Audit trail for re-sends |
| `accepted_at` | Set when a password is chosen; makes the invitation inert |

**Re-sending rotates every secret.** Any link or code emailed earlier stops
working the moment a new invite goes out.

An account only becomes usable when a password is set: `InvitationService::activate()`
flips `status` to `active` and stamps `email_verified_at`, without which
`LoginAction` would keep rejecting the brand-new sign-in as inactive.

---

## Admin endpoints

Both require authentication and pass through `EmployeePolicy@update`, so an admin
can only invite within their own company.

### `POST /api/v1/employees/{employee}/invitation`

```json
{ "role": "scheduler", "email": "sam@example.com" }
```

`email` is optional when the employee already has a linked account; supply it to
invite someone added without a login, or to correct a typo before re-sending.
Creates the login account if needed, links it to the employee, and emails the
invitation matching the role.

**422** when the employee has no email and none was supplied, or the address is
already used by another account.

### `DELETE /api/v1/employees/{employee}/invitation`

Clears every secret, making the emailed link/code inert. Returns **404** when
there is no invitation to revoke.

---

## Guest endpoints

All are guest-accessible and throttled — the emailed secret is the only
credential the caller holds.

### Web channel

| Endpoint | Body / query | Notes |
| -------- | ------------ | ----- |
| `GET /api/v1/invitations` | `token`, `email` | Previews the invitation so the SPA can greet the person by name and show their company + role. **10 req/min.** |
| `POST /api/v1/invitations/accept` | `token`, `email`, `password`, `password_confirmation` | Sets the first password. Single-use. **6 req/min.** |

The emailed link points at `/{FRONTEND_URL}/invitation/accept?token=…&email=…`,
handled by `AcceptInvitationPage`. On success the SPA redirects to the login
screen so the new password is exercised immediately.

### Mobile channel

The employee email links to `/invitation/download` (`DownloadAppPage`), which
reads store URLs from `GET /api/v1/mobile-app/links`. Then, in the app:

| Step | Endpoint | Body | Returns |
| ---- | -------- | ---- | ------- |
| 1 | `POST /api/v1/invitations/mobile/request-code` | `email` | `expires_in_minutes`. **6 req/min.** |
| 2 | `POST /api/v1/invitations/mobile/verify-code` | `email`, `code` | `setup_token`, `expires_in_minutes`. **10 req/min.** |
| 3 | `POST /api/v1/invitations/mobile/complete-setup` | `email`, `setup_token`, `password`, `password_confirmation` | The activated user. **6 req/min.** |

Step 1 returns the **same 200 response whether or not the address is
registered**, so the endpoint cannot be used to enumerate staff emails.

Step 2 consumes the code on success. A wrong code increments `code_attempts`;
once the budget is spent the code is burned and must be re-requested, which is
what stops a six-digit code from being brute forced.

---

## Configuration

Lifetimes and store links live in `config/invitations.php`, driven by the
`INVITATION_*` and `MOBILE_*_APP_URL` keys in `.env.example`. The store URLs may
be left blank until the apps are published — the download page then renders a
"coming soon" note instead of a dead link.

---

## Tests

`tests/Feature/Employee/EmployeeInvitationTest.php` covers both journeys
end-to-end, including token rotation on re-send, expiry, single-use enforcement,
attempt counting, email enumeration safety, revocation and cross-company access.
