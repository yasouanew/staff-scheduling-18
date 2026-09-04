<?php

namespace App\Services;

use App\Models\Company;
use App\Models\Subscription;
use Illuminate\Support\Carbon;

/**
 * Authoritative "does this company have access right now?" resolver.
 *
 * Every access decision in the application — the `company.access` and
 * `subscription.active` middleware, `Company::activeSubscription()`,
 * `EntitlementService`, the `UserResource` `company_access` block, and the
 * scheduled expiry jobs — MUST go through this service so there is exactly one
 * rule for what grants access and one clock (the server's) that decides it.
 *
 * Client-supplied timestamps are never used: the device clock, `Date.now()` on
 * the SPA, or a spoofed request timestamp cannot influence any decision here.
 * Expiry is always computed against {@see Carbon::now()} (the application clock,
 * `config('app.timezone')`, UTC by default) with a small, configurable skew
 * buffer that makes the server tolerant of its own clock being slightly behind
 * while never letting a client "extend" access by moving its clock.
 */
class AccessStateService
{
    public const REASON_TRIAL_ACTIVE = 'trial_active';
    public const REASON_SUBSCRIPTION_ACTIVE = 'subscription_active';
    public const REASON_SUBSCRIPTION_GRACE = 'subscription_grace';
    public const REASON_TRIAL_EXPIRED = 'trial_expired';
    public const REASON_SUBSCRIPTION_EXPIRED = 'subscription_expired';
    public const REASON_SUBSCRIPTION_SUSPENDED = 'subscription_suspended';
    public const REASON_SUBSCRIPTION_CANCELLED = 'subscription_cancelled';
    public const REASON_NO_SUBSCRIPTION = 'no_subscription';

    /**
     * How many seconds of clock skew the server tolerates before an entitlement
     * boundary is treated as having passed. This only ever makes the server
     * STRICTER against its own late clock; it is never used to widen access.
     */
    protected int $skewSeconds = 60;

    /**
     * @param  int  $skewSeconds  The skew buffer in seconds.
     */
    public function __construct(int $skewSeconds = 60)
    {
        $this->skewSeconds = $skewSeconds;
    }

    /**
     * The server-authoritative "now".
     */
    public function now(): Carbon
    {
        return Carbon::now();
    }

    /**
     * The reference instant used for boundary comparisons.
     *
     * Equals `now()` minus the skew buffer, so an entitlement whose boundary is
     * within the buffer is treated as lapsed rather than still open — the safe
     * direction for a billing lock.
     */
    public function comparisonInstant(): Carbon
    {
        return $this->now()->subSeconds($this->skewSeconds);
    }

    /**
     * Whether the company currently has a running registration trial,
     * evaluated against the server clock (never the client's).
     */
    public function isTrialActive(Company $company): bool
    {
        return $company->trial_ends_at !== null
            && $company->trial_ends_at->isAfter($this->comparisonInstant());
    }

    /**
     * The subscription that currently grants access, if any.
     *
     * Resolution order (mirrors the historical billing rules, consolidated here
     * so every caller shares one query):
     *  - an active subscription whose period has not ended;
     *  - a trialing subscription whose trial has not ended;
     *  - a grace-period subscription still inside its `grace_ends_at` window.
     *
     * All boundaries are compared to the server comparison instant, so a client
     * changing its clock can never re-open an expired window.
     */
    public function entitledSubscription(Company $company): ?Subscription
    {
        return $company->subscriptions()
            ->where(function ($query): void {
                $query->where('status', 'active')
                    ->where(function ($period): void {
                        $period->whereNull('ends_at')
                            ->orWhere('ends_at', '>', $this->comparisonInstant());
                    });
            })
            ->orWhere(function ($query): void {
                $query->where('status', 'trialing')
                    ->where(function ($trial): void {
                        $trial->whereNull('trial_ends_at')
                            ->orWhere('trial_ends_at', '>', $this->comparisonInstant());
                    });
            })
            ->orWhere(function ($query): void {
                $query->where('status', 'grace_period')
                    ->where(function ($grace): void {
                        $grace->whereNull('grace_ends_at')
                            ->orWhere('grace_ends_at', '>', $this->comparisonInstant());
                    });
            })
            ->latest('starts_at')
            ->first();
    }

    /**
     * Whether the company currently has any entitled subscription.
     */
    public function hasEntitledSubscription(Company $company): bool
    {
        return $this->entitledSubscription($company) !== null;
    }

    /**
     * Whether the company currently has access (trial OR entitled subscription).
     */
    public function hasAccess(Company $company): bool
    {
        return $this->isTrialActive($company) || $this->hasEntitledSubscription($company);
    }

    /**
     * The company is considered locked when no trial and no entitled
     * subscription remain.
     */
    public function isLocked(Company $company): bool
    {
        return ! $this->hasAccess($company);
    }

    /**
     * The reason a company currently has (or lacks) access, for diagnostics
     * and the `company_access` resource block.
     *
     * @return string One of the REASON_* constants.
     */
    public function accessReason(Company $company): string
    {
        if ($this->isTrialActive($company)) {
            return self::REASON_TRIAL_ACTIVE;
        }

        $subscription = $this->entitledSubscription($company);

        if ($subscription) {
            return match ($subscription->status) {
                'trialing' => self::REASON_TRIAL_ACTIVE,
                'grace_period' => self::REASON_SUBSCRIPTION_GRACE,
                default => self::REASON_SUBSCRIPTION_ACTIVE,
            };
        }

        $latest = $company->subscriptions()->latest('starts_at')->first();

        if ($latest) {
            return match ($latest->status) {
                'suspended' => self::REASON_SUBSCRIPTION_SUSPENDED,
                'cancelled' => self::REASON_SUBSCRIPTION_CANCELLED,
                default => self::REASON_SUBSCRIPTION_EXPIRED,
            };
        }

        if ($company->trial_ends_at !== null && $company->trial_ends_at->isPast()) {
            return self::REASON_TRIAL_EXPIRED;
        }

        return self::REASON_NO_SUBSCRIPTION;
    }

    /**
     * Serialize the access state for the `UserResource`/`company_access` block
     * (and any diagnostics surface). Every value is derived from server state —
     * never from anything the client sent.
     *
     * @return array{is_locked: bool, reason: string|null, trial_ends_at: string|null, trial_is_active: bool, active_subscription_id: int|null, active_subscription_ends_at: string|null}
     */
    public function toArray(Company $company): array
    {
        $subscription = $this->entitledSubscription($company);

        return [
            'is_locked' => $this->isLocked($company),
            'reason' => $this->accessReason($company),
            'trial_ends_at' => $company->trial_ends_at?->toIso8601String(),
            'trial_is_active' => $this->isTrialActive($company),
            'active_subscription_id' => $subscription?->id,
            'active_subscription_ends_at' => $subscription?->ends_at?->toIso8601String(),
        ];
    }
}
