# TASK 20 — Server-Authoritative Trial & Subscription Access (Device Clock Manipulation)

## Objective

Prevent users from manipulating trial and subscription access by changing the
clock or date on their device. A company in trial mode must not be able to
"extend" its trial by moving its device clock, and a company whose subscription
has ended must not be able to "unlock" access by rewinding its device clock.

**Result:** all trial/subscription access decisions are now resolved by a single
server-clock-authoritative service ([`AccessStateService`](app/Services/AccessStateService.php:25)),
shared by the models, middleware, resource, and entitlement engine that previously
each had their own (duplicated) copy of the rule. Sanctum tokens now expire on the
server, and the SPA revalidates the lock state against the server. A new 8-test
suite ([`ServerAuthoritativeAccessTest`](tests/Feature/Billing/ServerAuthoritativeAccessTest.php:30))
proves a client clock change can no longer influence access. All 46 pre-existing
billing tests remain green.

---

## 1. Root cause analysis

### What a client clock change can and cannot affect

Every server-side access check in this application already compared expiry
boundaries against **server-side** `now()` — never against a client-supplied
timestamp. An audit found **no** client timestamp being trusted anywhere in
`app/` or `resources/js/`.

The reason a user *observes* the trial/subscription state changing when they move
their device clock is the **local development environment**: with Laragon, the
"server" and the "device" are the **same machine**, so changing the OS clock
changes `now()` on the server too. In production (server clock separate from the
device clock) the manipulation would not work — but the design still had real
weaknesses worth fixing:

1. **Duplicated entitlement logic.** The "which subscription grants access right
   now?" rule existed independently in `Company::activeSubscription()`,
   [`EntitlementService::entitledSubscription()`](app/Services/EntitlementService.php:202),
   the two access middleware, and `SubscriptionStatus::grantsAccess()`-style
   checks. Each copy could drift, and a change in one place would not be reflected
   everywhere.
2. **Sanctum tokens never expired.** [`config/sanctum.php`](config/sanctum.php:53)
   had `'expiration' => null`, and `createToken()` was called without an
   `expires_at`. A long-lived token lets a stale/cached client session persist.
3. **Client-side stale caching.** The SPA cached the `company_access.is_locked`
   flag for 60s with window-focus refetching disabled, so a client could keep
   rendering an unlocked UI after the server locked the account.

### The fix strategy

Consolidate **every** access decision into one service that reads only the server
clock, with a conservative skew buffer that makes the server *stricter* against
its own late clock (never widening access). Then enforce token expiry on the
server and make the SPA revalidate against the server.

---

## 2. The single source of truth — `AccessStateService`

[`app/Services/AccessStateService.php`](app/Services/AccessStateService.php:25) is
the authoritative "does this company have access right now?" resolver.

Key design points:

- **Server clock only.** `now()` returns `Carbon::now()` (the application clock,
  UTC by default). No client timestamp, `Date.now()`, or request header is ever
  read.
- **Skew buffer in the safe direction.** `comparisonInstant()` returns
  `now() - 60s`. An entitlement boundary inside the buffer is treated as
  **lapsed** rather than still open. This tolerates a server clock that is a
  little slow without ever letting a client "extend" access. Configurable via the
  constructor for tests.
- **One query for all callers.** `entitledSubscription()` encodes the exact
  historical billing rule (active-while-live, trialing-while-running,
  grace-period-while-open) so every caller shares one query and one clock.
- **Diagnostics.** `accessReason()` and `toArray()` produce the
  `company_access` payload (is_locked, reason, trial_ends_at, trial_is_active,
  active_subscription_id, active_subscription_ends_at) used by
  [`UserResource`](app/Http/Resources/UserResource.php:37) and the 423 lock
  response.

### Consumers rewired to delegate

| Component | Change |
|---|---|
| [`Company`](app/Models/Company.php:91) | `isTrialActive()`, `activeSubscription()`, `isAccessLocked()` now delegate to `AccessStateService` via `accessState()`. |
| [`EntitlementService`](app/Services/EntitlementService.php:50) | `hasEntitledSubscription()` / `entitledSubscription()` delegate to `AccessStateService`; the duplicated query was removed. |
| [`CheckCompanyAccess`](app/Http/Middleware/CheckCompanyAccess.php:23) | Constructor-injects `AccessStateService`; grants on `hasAccess()`, returns 423 with `toArray()` when locked. |
| [`EnsureActiveSubscription`](app/Http/Middleware/EnsureActiveSubscription.php:22) | Constructor-injects `AccessStateService`; returns 402 unless `hasEntitledSubscription()`. |
| [`UserResource`](app/Http/Resources/UserResource.php:20) | `company_access` block is `AccessStateService::toArray()` + `locked_at`; null-company guard returns all-false defaults. |

> **Laravel container.** `AccessStateService` is resolved via `app(...)` /
> constructor injection, so the skew buffer and any future policy are configured
> in one place. (Note: this codebase runs on PHP 8.3 — see §5 — and deliberately
> avoids `readonly` promoted properties.)

---

## 3. Server-side token expiration (Sanctum)

- [`config/sanctum.php`](config/sanctum.php:53): `'expiration'` now defaults to
  **1440 minutes (24h)**, overridable via `SANCTUM_TOKEN_TTL_MINUTES`. Sanctum's
  [`Guard`](vendor/laravel/sanctum/src/Guard.php:127) enforces this against the
  **server** clock (`created_at` + minutes), so a client changing its device clock
  cannot keep an expired session alive.
- [`LoginAction`](app/Domains/Auth/Actions/LoginAction.php:33) and
  [`RegisterAction`](app/Domains/Auth/Actions/RegisterAction.php:64) now pass an
  explicit `expires_at = now() + TTL` to `createToken()`. The expiry is computed
  on the server; nothing from the client is trusted.

---

## 4. Frontend: stop stale "unlocked" UI

[`useWebSession`](resources/js/features/auth/hooks/useWebSession.ts:26) — the query
that feeds `ProtectedRoute` and the `company_access.is_locked` redirect — now:

- `staleTime: 30_000` (down from 60s),
- `refetchOnWindowFocus: true` and `refetchOnReconnect: true` (overriding the app
  default that disabled these),
- `refetchInterval: 60_000` (poll while the tab is open).

Every revalidation hits `/auth/me`, whose `company_access` block is computed by
`AccessStateService` on the server. The client clock never enters the equation.

---

## 5. Environment note — PHP version

The project requires PHP **>= 8.3** (see [`composer.json`](composer.json:24)), but
the default `php` on PATH is XAMPP 8.0.30. Use the Laragon 8.3 binary:

```powershell
C:\laragon\bin\php\php-8.3.16-Win32-vs16-x64\php.exe artisan test
```

---

## 6. How to test that device-clock changes no longer grant access

Run the dedicated suite:

```powershell
C:\laragon\bin\php\php-8.3.16-Win32-vs16-x64\php.exe artisan test --filter=ServerAuthoritativeAccessTest
```

[`tests/Feature/Billing/ServerAuthoritativeAccessTest.php`](tests/Feature/Billing/ServerAuthoritativeAccessTest.php:30)
proves the invariant: **a client that changes its device clock has no way to
influence the server's answer.** It does this by (a) simulating forged client
timestamps (e.g. `X-Device-Time` headers claiming a future/past date) that are
never read, and (b) advancing the **server** clock with `Carbon::setTestNow()`,
then asserting access flips only when the server clock passes the boundary.

Covered scenarios:

| Test | Proves |
|---|---|
| `test_client_supplied_timestamp_does_not_extend_trial` | A forged future client time does not extend a trial; only the server clock lapses it. |
| `test_trial_expiry_is_measured_on_server_clock` | `isAccessLocked()` / `isTrialActive()` track the server clock. |
| `test_expired_subscription_cannot_be_reopened_by_client_clock_claim` | A client claiming an earlier date cannot reopen an expired subscription. |
| `test_grace_period_expiry_is_server_authoritative` | Grace-period expiry follows the server clock. |
| `test_check_company_access_uses_server_clock_not_client_claims` | The `company.access` middleware (HTTP 423) ignores client clock claims. |
| `test_me_resource_lock_flag_is_server_authoritative` | `GET /auth/me` returns `company_access.is_locked` from the server clock. |
| `test_ensure_active_subscription_middleware_is_server_authoritative` | The `subscription.active` middleware (HTTP 402) is server-authoritative. |
| `test_all_access_paths_agree_after_server_clock_advances` | Company, EntitlementService, and AccessStateService all agree at each boundary. |

### Manual verification

1. **Trial manipulation:** register a company on a trial. From a *second* device
   (or by adjusting the server OS clock — which in Laragon is the same machine),
   try to move the clock forward past `trial_ends_at`. The SPA's next
   `/auth/me` revalidation (focus/poll) reports `is_locked: true` and routes to
   `/account-locked`; operational API calls return 423.
2. **Subscription unlock:** cancel/expire a subscription, then try rewinding the
   device clock to before `ends_at`. The server still returns 402/423 because the
   comparison uses the server clock. Note: in a purely local Laragon setup the
   OS clock *is* the server clock, so this is best validated by keeping the
   server clock fixed (or using `Carbon::setTestNow` in tests).
3. **Token expiry:** after `SANCTUM_TOKEN_TTL_MINUTES` elapses, the server rejects
   the token (401) even if the device clock is rewound, because `Guard` compares
   against `created_at`.

---

## 7. Files changed

**New:**
- [`app/Services/AccessStateService.php`](app/Services/AccessStateService.php) — authoritative resolver.
- [`tests/Feature/Billing/ServerAuthoritativeAccessTest.php`](tests/Feature/Billing/ServerAuthoritativeAccessTest.php) — 8 server-authoritative tests.
- [`docs/task-20-server-authoritative-access.md`](docs/task-20-server-authoritative-access.md) — this document.

**Modified:**
- [`app/Models/Company.php`](app/Models/Company.php) — delegate trial/subscription/locked checks.
- [`app/Services/EntitlementService.php`](app/Services/EntitlementService.php) — delegate entitlement queries.
- [`app/Http/Middleware/CheckCompanyAccess.php`](app/Http/Middleware/CheckCompanyAccess.php) — use `AccessStateService`.
- [`app/Http/Middleware/EnsureActiveSubscription.php`](app/Http/Middleware/EnsureActiveSubscription.php) — use `AccessStateService`.
- [`app/Http/Resources/UserResource.php`](app/Http/Resources/UserResource.php) — `company_access` from `AccessStateService`.
- [`config/sanctum.php`](config/sanctum.php) — default 24h token expiry (`SANCTUM_TOKEN_TTL_MINUTES`).
- [`app/Domains/Auth/Actions/LoginAction.php`](app/Domains/Auth/Actions/LoginAction.php) — server-computed `expires_at`.
- [`app/Domains/Auth/Actions/RegisterAction.php`](app/Domains/Auth/Actions/RegisterAction.php) — server-computed `expires_at`.
- [`resources/js/features/auth/hooks/useWebSession.ts`](resources/js/features/auth/hooks/useWebSession.ts) — revalidate lock state on focus/reconnect/poll.
