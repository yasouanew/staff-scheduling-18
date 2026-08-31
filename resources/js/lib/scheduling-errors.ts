import {
    getBillingErrorCode,
} from '@/features/billing/lib/billing-errors';
import { getApiErrorMessage } from '@/lib/api-client';

/**
 * Neutral, pricing-free error message for scheduling operations.
 *
 * Scheduling is operational: when a write is blocked by a subscription
 * capacity/branch limit, we must not surface plan names, upgrade prompts or
 * pricing. Instead we show the fixed message below and direct the user to their
 * company administrator. All other failures fall through to the standard API
 * message resolver.
 */
const CAPACITY_MESSAGE = 'Employee capacity reached. Contact your company administrator.';

/** Error codes that indicate a capacity/plan-enforcement block on scheduling. */
const CAPACITY_CODES = new Set([
    'EMPLOYEE_CAPACITY_REACHED',
    'BRANCH_LIMIT_REACHED',
    'BRANCH_NOT_ENTITLED',
    'FEATURE_NOT_AVAILABLE',
    'NO_ACTIVE_SUBSCRIPTION',
    'SUBSCRIPTION_EXPIRED',
    'SUBSCRIPTION_PAST_DUE',
    'DOWNGRADE_BRANCH_LIMIT_EXCEEDED',
    'DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED',
]);

/**
 * Resolve a scheduling-operation error into a user-facing message without any
 * pricing or upgrade language. Capacity/plan-enforcement failures always render
 * the neutral "Employee capacity reached" message; everything else defers to
 * {@link getApiErrorMessage}.
 */
export function schedulingErrorMessage(error: unknown, fallback = 'Please try again.'): string {
    const code = getBillingErrorCode(error);
    if (code && CAPACITY_CODES.has(code)) {
        return CAPACITY_MESSAGE;
    }
    return getApiErrorMessage(error, fallback);
}
