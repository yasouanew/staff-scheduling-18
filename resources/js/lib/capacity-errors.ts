import { getBillingErrorCode } from '@/features/billing/lib/billing-errors';

/**
 * Seat-capacity error handling.
 *
 * The backend guards every user-activation path (`EmployeeService`,
 * `InvitationService::activate`, reset-password promotion) and every plan
 * downgrade with a structured `422` envelope:
 *
 *     {
 *         "success": false,
 *         "message": "Seat limit reached. Upgrade your plan to add more members.",
 *         "code": "EMPLOYEE_CAPACITY_REACHED",
 *         "errors": { "used": 25, "capacity": 25, "remaining": 0 }
 *     }
 *
 * The two seat-related codes map onto distinct UI outcomes:
 *   - `EMPLOYEE_CAPACITY_REACHED`        → offer the upgrade prompt.
 *   - `DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED` → explain the downgrade conflict.
 *
 * **Staleness invariant:** the client's seat count can drift (multi-tab,
 * invited-but-not-accepted). A backend `422` is therefore always authoritative —
 * these helpers `refetch()` seats on every seat-capacity failure so the UI
 * settles on the server's numbers (see plan edge-case #13).
 */

/** The two seat-capacity error codes the UI reacts to. */
export type SeatCapacityErrorCode =
    | 'EMPLOYEE_CAPACITY_REACHED'
    | 'DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED';

/** Parsed, ready-to-render description of a seat-capacity failure. */
export interface SeatCapacityErrorInfo {
    /** The backend error code. */
    code: SeatCapacityErrorCode;
    /** Active user accounts reported by the backend (or `null` if absent). */
    used: number | null;
    /** The plan seat cap reported by the backend (or `null` if absent). */
    capacity: number | null;
    /** `capacity - used` when both are known, otherwise `null`. */
    remaining: number | null;
    /** Human-readable backend message. */
    message: string | null;
}

/** Normalized, ready-to-consume seat-capacity numbers (numbers only). */
interface SeatNumbers {
    used: number | null;
    capacity: number | null;
    remaining: number | null;
}

/** Backend `errors` block for a seat-capacity failure (raw wire values). */
interface CapacityErrorDetails {
    used?: number | string | null;
    capacity?: number | string | null;
    remaining?: number | string | null;
}

const toNumber = (value: number | string | null | undefined): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Detect + parse a seat-capacity failure from a thrown request error.
 *
 * Returns `null` when the error is not a structured seat-capacity `422`, so
 * callers can fall back to generic error handling.
 */
export function getSeatCapacityError(error: unknown): SeatCapacityErrorInfo | null {
    const code = getBillingErrorCode(error);
    if (code !== 'EMPLOYEE_CAPACITY_REACHED' && code !== 'DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED') {
        return null;
    }

    const details = extractDetails(error);

    return {
        code,
        used: details.used,
        capacity: details.capacity,
        remaining: details.remaining,
        message: extractMessage(error),
    };
}

/** Convenience predicate — is this a seat-capacity (not branch) failure? */
export function isSeatCapacityError(error: unknown): boolean {
    return getSeatCapacityError(error) !== null;
}

/**
 * Central handler for a seat-capacity failure.
 *
 * Always refetches seats — a backend `422` means the client's count was stale —
 * then returns the parsed error info so the caller can open the matching dialog
 * (upgrade prompt for `EMPLOYEE_CAPACITY_REACHED`, downgrade conflict for
 * `DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED`).
 *
 * @param refetchSeats A callback that re-reads the authoritative seat usage
 *   (typically `useSeatCapacity().refetch`).
 * @returns The parsed failure info, or `null` when the error is unrelated.
 */
export async function handleCapacityError(
    error: unknown,
    refetchSeats: () => Promise<unknown>,
): Promise<SeatCapacityErrorInfo | null> {
    const info = getSeatCapacityError(error);

    // The 422 is authoritative; the local count is stale by definition.
    // Best-effort refetch so the next render reflects the server's numbers.
    try {
        await refetchSeats();
    } catch {
        // Refetch failure must not mask the original error.
    }

    return info;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

interface BillingErrorEnvelope {
    message?: string;
    errors?: CapacityErrorDetails;
}

function extractDetails(error: unknown): SeatNumbers {
    if (!isErrorLike(error)) return { used: null, capacity: null, remaining: null };
    const data = error.response?.data as BillingErrorEnvelope | undefined;
    if (!data || typeof data !== 'object') return { used: null, capacity: null, remaining: null };
    const errors = data.errors;
    if (!errors || typeof errors !== 'object') return { used: null, capacity: null, remaining: null };
    return {
        used: toNumber(errors.used),
        capacity: toNumber(errors.capacity),
        remaining: toNumber(errors.remaining),
    };
}

function extractMessage(error: unknown): string | null {
    if (!isErrorLike(error)) return null;
    const data = error.response?.data as { message?: string } | undefined;
    return typeof data?.message === 'string' && data.message.length > 0 ? data.message : null;
}

/** Minimal structural guard so callers can pass arbitrary unknown errors. */
function isErrorLike(error: unknown): error is { response?: { data?: unknown } } {
    return typeof error === 'object' && error !== null && 'response' in error;
}
