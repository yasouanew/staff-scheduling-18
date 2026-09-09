import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';

import { normalizeWebRole, useWebSession } from '@/features/auth/hooks/useWebSession';

import { useUsageOverview } from '../hooks/useSubscription';

/**
 * Active-user seat capacity context.
 *
 * Under the per-seat billing model a "seat" is one *active user account* in the
 * company (any role except the platform-wide `super_admin`, with or without an
 * employee profile — the founding `company_admin` included). This context makes
 * the live seat count / allowance available to every company-management screen
 * so headers, action guards and dialogs all read the same values.
 *
 * Data source: `GET /subscription/usage` → `seats: { used, limit }` (reused via
 * {@link useUsageOverview}, so the Subscription Dashboard and this context share
 * one query cache entry). `limit` is the entitled plan's seat cap; `null` means
 * unlimited seats.
 *
 * ### Role gating
 * The usage endpoint is authorized by the backend `subscription.view`
 * permission, which is granted to `company_admin` only (schedulers read the
 * directory but do not manage billing). The provider therefore only enables the
 * query for `company_admin` sessions; other authenticated roles receive a benign
 * no-op context (`seatsRemaining: null`) so consumers never 403 and can hide
 * seat surfaces for non-billing roles.
 *
 * ### Invariant / staleness
 * The backend remains authoritative: a `422` with
 * `EMPLOYEE_CAPACITY_REACHED` / `DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED` is always
 * treated as ground truth and callers invoke {@link SeatCapacityValue.refetch}
 * after any seat-affecting mutation (add / reactivate / invite / plan change).
 * See `lib/capacity-errors.ts`.
 */

export interface SeatCapacityValue {
    /** Whether the current session may read seat usage (i.e. `company_admin`). */
    available: boolean;
    /** Number of active (non-super-admin) user accounts in the company. */
    seatsUsed: number;
    /** Entitled plan seat cap; `null` means unlimited. */
    seatsLimit: number | null;
    /** `limit - used`; `null` when the plan is unlimited or usage is unavailable. */
    seatsRemaining: number | null;
    /** Whether the underlying usage query is still loading (no data yet). */
    isLoading: boolean;
    /** Force the underlying usage query to refetch (call after seat mutations). */
    refetch: () => Promise<unknown>;
    /** Convenience boolean for "seats are exhausted" (finite cap reached). */
    isFull: boolean;
}

const SeatCapacityContext = createContext<SeatCapacityValue | null>(null);

/** Fallback value for sessions that cannot read company seat usage. */
const UNAVAILABLE_VALUE: SeatCapacityValue = {
    available: false,
    seatsUsed: 0,
    seatsLimit: null,
    seatsRemaining: null,
    isLoading: false,
    refetch: async () => undefined,
    isFull: false,
};

/**
 * Provides live seat usage to the authenticated dashboard subtree.
 *
 * Mount once around `DashboardLayout` (via `ProtectedLayout`). Only
 * `company_admin` sessions fetch usage; all other roles get {@link UNAVAILABLE_VALUE}.
 */
export function SeatCapacityProvider({ children }: PropsWithChildren): JSX.Element {
    const session = useWebSession();
    const role = normalizeWebRole(session.data);

    // While the session is still resolving we default to the unavailable state;
    // once it loads as `company_admin` the inner provider mounts and fetches.
    if (role !== 'company_admin') {
        return <SeatCapacityContext.Provider value={UNAVAILABLE_VALUE}>{children}</SeatCapacityContext.Provider>;
    }

    return <SeatCapacityLiveProvider>{children}</SeatCapacityLiveProvider>;
}

/** Inner provider — only mounted for `company_admin`, so the query never 403s. */
function SeatCapacityLiveProvider({ children }: PropsWithChildren): JSX.Element {
    const { data, isLoading, refetch } = useUsageOverview();

    const value = useMemo<SeatCapacityValue>(() => {
        const used = data?.seats?.used ?? 0;
        const limit = data?.seats?.limit ?? null;

        return {
            available: true,
            seatsUsed: used,
            seatsLimit: limit,
            seatsRemaining: limit === null ? null : Math.max(limit - used, 0),
            isLoading,
            refetch: () => refetch(),
            isFull: limit !== null && used >= limit,
        };
    }, [data, isLoading, refetch]);

    return <SeatCapacityContext.Provider value={value}>{children}</SeatCapacityContext.Provider>;
}

/**
 * Reads the active-user seat capacity for the current company.
 *
 * Throws when rendered outside a {@link SeatCapacityProvider} — the provider is
 * mounted for every authenticated dashboard screen, so this only fires on a
 * wiring mistake.
 */
export function useSeatCapacity(): SeatCapacityValue {
    const context = useContext(SeatCapacityContext);
    if (context === null) {
        throw new Error('useSeatCapacity must be used within a <SeatCapacityProvider>.');
    }
    return context;
}
