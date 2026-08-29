import axios from 'axios';

import type { ApiErrorResponse } from '@/lib/api-client';

import type { BillingErrorCode } from '../types';

/**
 * Billing-specific error handling.
 *
 * The backend surfaces structured billing failures (capacity exceeded, branch
 * limit reached, expired/past-due subscription, plan-change violations) as an
 * `{ success, message, code, errors }` envelope with a machine-readable `code`.
 * These helpers let the billing UI branch on that `code` (e.g. "show the
 * Increase Capacity action") without embedding HTTP-status logic in components.
 */

/** Every billing error code the UI knows how to react to. */
export const BILLING_ERROR_CODES = new Set<BillingErrorCode>([
    'EMPLOYEE_CAPACITY_REACHED',
    'BRANCH_LIMIT_REACHED',
    'BRANCH_NOT_ENTITLED',
    'FEATURE_NOT_AVAILABLE',
    'SUBSCRIPTION_EXPIRED',
    'SUBSCRIPTION_PAST_DUE',
    'NO_ACTIVE_SUBSCRIPTION',
    'DOWNGRADE_BRANCH_LIMIT_EXCEEDED',
    'DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED',
    'CROSS_BUSINESS_ACCESS_DENIED',
    'UNAUTHORIZED',
]);

/**
 * Extract the backend `code` from a thrown request error, or `null` when the
 * failure is not a structured billing error.
 */
export function getBillingErrorCode(error: unknown): BillingErrorCode | null {
    if (!axios.isAxiosError<ApiErrorResponse & { code?: string }>(error)) {
        return null;
    }

    const code = error.response?.data?.code;

    if (code && BILLING_ERROR_CODES.has(code as BillingErrorCode)) {
        return code as BillingErrorCode;
    }

    return null;
}

/**
 * Whether a thrown error represents a capacity violation (`EMPLOYEE_CAPACITY_REACHED`).
 *
 * The management UI turns this into an "Employee capacity reached" state and
 * offers the `[Increase Capacity]` action.
 */
export function isCapacityReachedError(error: unknown): boolean {
    return getBillingErrorCode(error) === 'EMPLOYEE_CAPACITY_REACHED';
}

/**
 * Whether a thrown error represents the business exceeding its plan's active
 * branch allowance (`BRANCH_LIMIT_REACHED`). Used to surface an upgrade prompt
 * instead of a bare error message.
 */
export function isBranchLimitReachedError(error: unknown): boolean {
    return getBillingErrorCode(error) === 'BRANCH_LIMIT_REACHED';
}

/**
 * Whether a thrown error represents a subscription that can no longer grant
 * access (`SUBSCRIPTION_EXPIRED` / `SUBSCRIPTION_PAST_DUE`). Used to route the
 * user toward reactivating their plan.
 */
export function isSubscriptionInvalidError(error: unknown): boolean {
    const code = getBillingErrorCode(error);
    return code === 'SUBSCRIPTION_EXPIRED' || code === 'SUBSCRIPTION_PAST_DUE';
}
