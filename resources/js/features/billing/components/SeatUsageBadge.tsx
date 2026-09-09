import { Users } from 'lucide-react';

import { cn } from '@/lib/utils';

interface SeatUsageBadgeProps {
    /** Active user accounts currently in use. */
    used: number;
    /** Plan seat cap; `null` means unlimited. */
    limit: number | null;
    /** Whether seat usage is still loading (render a muted skeleton). */
    isLoading?: boolean;
}

/**
 * Compact "X of Y user seats in use" pill shown in the Employee Directory
 * header for company admins.
 *
 * A seat is one active user account (any non-super-admin role, with or without
 * an employee profile — the founding company_admin included). The pill turns
 * warning/danger as the allowance fills up so admins can see at a glance when
 * an activation is about to be blocked.
 */
export function SeatUsageBadge({
    used,
    limit,
    isLoading = false,
}: SeatUsageBadgeProps): JSX.Element {
    const full = limit !== null && used >= limit;
    const nearFull =
        !full && limit !== null && used >= Math.max(Math.ceil(limit * 0.9), 1);

    return (
        <span
            className={cn(
                'inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-medium',
                full
                    ? 'border-danger/30 bg-danger/10 text-danger'
                    : nearFull
                        ? 'border-warning/30 bg-warning/10 text-warning'
                        : 'border-border bg-card text-muted-foreground',
            )}
            title="Active user accounts against your plan's seat allowance"
        >
            <Users aria-hidden="true" className="size-4" />
            {isLoading ? (
                <span className="h-3 w-12 animate-pulse rounded bg-muted" />
            ) : limit === null ? (
                <span>{used} active {used === 1 ? 'user' : 'users'}</span>
            ) : (
                <span>
                    {used} of {limit} user {used === 1 ? 'seat' : 'seats'} in use
                </span>
            )}
        </span>
    );
}
