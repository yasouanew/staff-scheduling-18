/**
 * Billing formatting helpers.
 *
 * Prices are always read from the backend plan records — the UI never computes
 * billing amounts. These helpers only *present* the values the API supplies.
 */

/** Format a numeric price with the plan's currency symbol. */
export function formatPrice(value: number, currency = 'AUD'): string {
    const safe = Number.isFinite(value) ? value : 0;

    try {
        return new Intl.NumberFormat('en-AU', {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(safe);
    } catch {
        return `$${safe.toFixed(2)}`;
    }
}

/** Format a per-cycle price, e.g. `$29 / month`. */
export function formatCyclePrice(value: number, currency: string, cycle: string): string {
    const label = cycle === 'six_month' ? '6 months' : cycle;
    return `${formatPrice(value, currency)} / ${label}`;
}

/**
 * Human-friendly employee/branch capacity label.
 *
 * `null` capacity means unlimited, which the UI renders as "Unlimited".
 */
export function formatCapacity(value: number | null): string {
    return value === null ? 'Unlimited' : String(value);
}
