<?php

namespace App\Enums;

/**
 * Centralized subscription / branch-subscription status values.
 *
 * Single source of truth for every subscription state so no string is ever
 * scattered through the codebase. The case VALUES mirror the existing Phase 1
 * `subscriptions.status` column convention ('trialing', 'active', ...), so the
 * enum can be adopted without migrating existing rows. `Paused` is supported
 * for future use; the database stores status as a plain string so adding a
 * state here never requires a destructive schema change.
 */
enum SubscriptionStatus: string
{
    case Trial = 'trialing';
    case Active = 'active';
    case PastDue = 'past_due';
    case GracePeriod = 'grace_period';
    case Suspended = 'suspended';
    case Paused = 'paused';
    case Cancelled = 'cancelled';
    case Expired = 'expired';

    /**
     * Human-readable label for UI rendering.
     */
    public function label(): string
    {
        return match ($this) {
            self::Trial => 'Trial',
            self::Active => 'Active',
            self::PastDue => 'Past due',
            self::GracePeriod => 'Grace period',
            self::Suspended => 'Suspended',
            self::Paused => 'Paused',
            self::Cancelled => 'Cancelled',
            self::Expired => 'Expired',
        };
    }

    /**
     * Whether this status grants access to the paid service.
     *
     * Trial, active and grace-period states still unlock the workspace; every
     * other state should cause the company/branch to be treated as not
     * entitled. A subscription that has moved into its grace period keeps
     * access for a short, business-configurable window before it is suspended.
     */
    public function grantsAccess(): bool
    {
        return in_array($this, [self::Trial, self::Active, self::GracePeriod], true);
    }
}
