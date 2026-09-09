import { format, parseISO } from 'date-fns';
import { ArrowRight, CalendarClock } from 'lucide-react';

import { Badge } from '@/Components/ui/badge';
import { Button } from '@/Components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/Components/ui/dialog';

import type { ManagementPlan, PlanChangeEstimate, SubscriptionSummary } from '../types';
import { formatCapacity, formatCyclePrice, formatPrice } from '../lib/format';

interface UpgradePlanDialogProps {
    open: boolean;
    summary: SubscriptionSummary | null;
    /** The plan the user selected from the catalogue. */
    targetPlan: ManagementPlan | null;
    selectedCycle: string;
    /**
     * Server-computed proration estimate for the selected target plan/cycle.
     * `null` while the estimate is loading or unavailable.
     */
    estimate: PlanChangeEstimate | null;
    /** Whether the change is a downgrade (limits shrink) vs an upgrade. */
    isDowngrade: boolean;
    isPending: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (plan: ManagementPlan) => void;
}

/** Whether moving from the current plan's limits to the target's is a downgrade. */
function comparePlanLevel(current: ManagementPlan, target: ManagementPlan): 'upgrade' | 'downgrade' {
    const currentRank = rankOf(current);
    const targetRank = rankOf(target);
    if (targetRank > currentRank) return 'upgrade';
    if (targetRank < currentRank) return 'downgrade';
    return 'upgrade';
}

function rankOf(plan: ManagementPlan): number {
    // Rank by the billable seat allowance (active users); used only to label
    // the change direction in the UI. The backend decides whether a change is
    // legal.
    return plan.maxSeats === null ? 10_000 : plan.maxSeats;
}

function isDowngradeDirection(summary: SubscriptionSummary | null, target: ManagementPlan | null): boolean {
    if (!summary?.plan || !target) return false;
    const current: ManagementPlan = {
        id: summary.plan.id,
        name: summary.plan.name,
        slug: summary.plan.slug,
        description: summary.plan.description,
        currency: summary.plan.currency,
        priceMonthly: summary.plan.priceMonthly,
        priceSixMonthly: null,
        priceYearly: summary.plan.priceYearly,
        interval: [summary.plan.interval],
        maxBranches: summary.plan.maxBranches,
        maxEmployees: summary.plan.maxEmployees,
        maxSeats: summary.plan.maxSeats,
        features: [],
    };
    return comparePlanLevel(current, target) === 'downgrade';
}

/** Safe date formatter for ISO strings (matches the billing page helper). */
function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    try {
        return format(parseISO(value), 'd MMM yyyy');
    } catch {
        return value;
    }
}

/**
 * Confirmation dialog for changing the business plan.
 *
 * Shows the current plan alongside the selected plan and the resulting
 * active-user seat allowance, and lets the user confirm. The backend remains
 * authoritative on the final price and whether the change is permitted (it may
 * reject an invalid downgrade with `DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED` / etc.).
 *
 * The `estimate` prop carries the server-computed proration for the selected
 * target plan/cycle: switching plans charges (or credits) the prorated
 * difference for the current billing period, and the renewal date stays the
 * same (Task 6).
 */
export function UpgradePlanDialog({
    open,
    summary,
    targetPlan,
    selectedCycle,
    estimate,
    isDowngrade,
    isPending,
    onOpenChange,
    onConfirm,
}: UpgradePlanDialogProps): JSX.Element {
    if (!targetPlan) return <Dialog open={open} onOpenChange={onOpenChange} />;

    const action = isDowngrade ? 'Downgrade plan' : 'Upgrade plan';

    const currentPrice =
        selectedCycle === 'monthly'
            ? summary?.plan?.priceMonthly
            : selectedCycle === 'six_month'
                ? null
                : summary?.plan?.priceYearly;

    const targetPrice =
        selectedCycle === 'monthly'
            ? targetPlan.priceMonthly
            : selectedCycle === 'six_month'
                ? targetPlan.priceSixMonthly ?? targetPlan.priceMonthly
                : targetPlan.priceYearly;

    // Server-computed proration estimate for the selected target plan/cycle.
    // `amountDue` is the "rest of the money" to top up to the new plan for the
    // current period (positive = pay now, negative = credit back). `renewsAt`
    // mirrors the subscription's `ends_at` — a plan switch never changes the
    // renewal date.
    const estimateCurrency = estimate?.currency ?? summary?.plan?.currency ?? 'AUD';
    const amountDue = estimate?.amountDue ?? 0;
    const renewsAt = estimate?.renewsAt ?? summary?.subscription?.renewsAt ?? summary?.subscription?.endsAt;
    const hasEstimate = estimate?.elapsed !== null && estimate?.elapsed !== undefined;
    const hasProration = hasEstimate && Math.abs(amountDue) > 0.004;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{action}</DialogTitle>
                    <DialogDescription>
                        Review the resulting limits before confirming. Your billing is managed by
                        our billing provider — the final amount shown is calculated server-side.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {/* Current plan */}
                        <div className="rounded-lg border border-border bg-muted/30 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Current plan
                            </p>
                            <p className="mt-1 font-semibold text-foreground">{summary?.plan?.name ?? '—'}</p>
                            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                                <p>
                                    Active users (seats): {formatCapacity(summary?.plan?.maxSeats ?? null)}
                                </p>
                            </div>
                            {currentPrice !== undefined && currentPrice !== null && (
                                <p className="mt-3 text-sm font-medium text-foreground">
                                    {formatCyclePrice(currentPrice, summary?.plan?.currency ?? 'AUD', selectedCycle)}
                                </p>
                            )}
                        </div>

                        {/* New plan */}
                        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                                    New plan
                                </p>
                                <ArrowRight className="h-4 w-4 text-primary" aria-hidden="true" />
                            </div>
                            <p className="mt-1 font-semibold text-foreground">{targetPlan.name}</p>
                            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                                <p>Active users (seats): {formatCapacity(targetPlan.maxSeats)}</p>
                            </div>
                            <p className="mt-3 text-sm font-medium text-foreground">
                                {formatCyclePrice(targetPrice, targetPlan.currency, selectedCycle)}
                            </p>
                        </div>
                    </div>

                    {targetPlan.features.length > 0 && (
                        <div>
                            <p className="mb-2 text-sm font-medium text-foreground">Features</p>
                            <div className="flex flex-wrap gap-1.5">
                                {targetPlan.features.map((feature) => (
                                    <Badge key={feature} variant="neutral">
                                        {feature}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    {hasProration && (
                        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
                            <p className="font-medium text-foreground">
                                {amountDue > 0 ? 'Prorated charge due now' : 'Prorated credit applied'}
                            </p>
                            <p className="mt-1 text-muted-foreground">
                                {amountDue > 0
                                    ? `You'll pay ${formatPrice(amountDue, estimateCurrency)} now to match the new plan for the rest of your current billing period.`
                                    : `A credit of ${formatPrice(Math.abs(amountDue), estimateCurrency)} will be applied toward your next renewal.`}
                            </p>
                        </div>
                    )}

                    <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
                        {isDowngrade
                            ? 'If your active users (seats) exceed the new plan seat limit, the change may be blocked.'
                            : 'Your subscription will be updated to the new plan on confirmation.'}
                    </div>

                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                        {renewsAt
                            ? `Your renewal date stays the same: ${formatDate(renewsAt)}`
                            : 'Your renewal date stays the same.'}
                    </p>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => onConfirm(targetPlan)}
                        disabled={isPending}
                        loading={isPending}
                        loadingLabel={isDowngrade ? 'Downgrading…' : 'Upgrading…'}
                    >
                        Confirm {isDowngrade ? 'downgrade' : 'upgrade'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export { isDowngradeDirection };
