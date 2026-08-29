import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/Components/ui/button';
import { cn } from '@/lib/utils';

interface CapacityWarningProps {
    /** Number of employees currently assigned to the branch. */
    used: number;
    /** Branch employee capacity; `null` means unlimited. */
    capacity: number | null;
    /** Rendered when capacity is full (or exceeded) — e.g. an Increase action. */
    action?: ReactNode;
    className?: string;
}

/**
 * Renders the near-capacity / at-capacity guidance for a branch.
 *
 * - At or above capacity  → "Employee capacity reached" with an optional action
 *   (the caller supplies an `[Increase Capacity]` button).
 * - Below capacity        → "X employee positions remaining".
 * - Unlimited capacity    → nothing (no meaningful warning).
 *
 * The backend remains authoritative on the actual numbers; this is purely
 * presentational.
 */
export function CapacityWarning({ used, capacity, action, className }: CapacityWarningProps): JSX.Element | null {
    if (capacity === null) {
        return null;
    }

    const remaining = capacity - used;

    if (remaining <= 0) {
        return (
            <div
                role="status"
                className={cn(
                    'flex flex-col gap-3 rounded-lg border border-danger/30 bg-danger/10 p-3 sm:flex-row sm:items-center sm:justify-between',
                    className,
                )}
            >
                <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                    <div className="text-sm text-foreground">
                        <p className="font-medium text-danger">Employee capacity reached</p>
                        <p className="text-muted-foreground">
                            {used} of {capacity} employee positions are filled.
                        </p>
                    </div>
                </div>
                {action ? <div className="shrink-0">{action}</div> : null}
            </div>
        );
    }

    // Near capacity: within 25% or 3 positions of the limit.
    const isNear = remaining <= Math.max(3, Math.ceil(capacity * 0.25));

    return (
        <div
            role="status"
            className={cn(
                'flex items-start gap-2 rounded-lg border p-3 text-sm',
                isNear
                    ? 'border-warning/30 bg-warning/10'
                    : 'border-success/30 bg-success/10',
                className,
            )}
        >
            <CheckCircle2
                className={cn('mt-0.5 h-4 w-4 shrink-0', isNear ? 'text-warning' : 'text-success')}
                aria-hidden="true"
            />
            <p className="text-foreground">
                {isNear ? (
                    <span className="font-medium text-warning">
                        {remaining} {remaining === 1 ? 'position' : 'positions'} remaining
                    </span>
                ) : (
                    <span className="font-medium text-success">{remaining} positions remaining</span>
                )}
                <span className="text-muted-foreground"> — {used} of {capacity} employees assigned.</span>
            </p>
        </div>
    );
}

/** Convenience "Increase capacity" action button used inside {@link CapacityWarning}. */
export function IncreaseCapacityButton({
    onClick,
    loading = false,
}: {
    onClick: () => void;
    loading?: boolean;
}): JSX.Element {
    return (
        <Button variant="outline" size="sm" onClick={onClick} loading={loading}>
            Increase capacity
        </Button>
    );
}
