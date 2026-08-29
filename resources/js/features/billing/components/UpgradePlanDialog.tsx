import { ArrowRight } from 'lucide-react';

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

import type { ManagementPlan, SubscriptionSummary } from '../types';
import { formatCapacity, formatCyclePrice } from '../lib/format';

interface UpgradePlanDialogProps {
    open: boolean;
    summary: SubscriptionSummary | null;
    /** The plan the user selected from the catalogue. */
    targetPlan: ManagementPlan | null;
    selectedCycle: string;
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
    // Rank by how many resources the plan unlocks; used only to label the
    // change direction in the UI. The backend decides whether a change is legal.
    const branches = plan.maxBranches === null ? 10_000 : plan.maxBranches;
    const employees = plan.maxEmployees === null ? 10_000 : plan.maxEmployees;
    return branches * 1000 + employees;
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
        features: [],
    };
    return comparePlanLevel(current, target) === 'downgrade';
}

/**
 * Confirmation dialog for changing the business plan.
 *
 * Shows the current plan alongside the selected plan and the resulting branch /
 * employee limits, and lets the user confirm. The backend remains authoritative
 * on the final price and whether the change is permitted (it may reject an
 * invalid downgrade with `DOWNGRADE_BRANCH_LIMIT_EXCEEDED` / etc.).
 */
export function UpgradePlanDialog({
    open,
    summary,
    targetPlan,
    selectedCycle,
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
                                    Branches: {formatCapacity(summary?.plan?.maxBranches ?? null)}
                                </p>
                                <p>Employees: {formatCapacity(summary?.plan?.maxEmployees ?? null)}</p>
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
                                <p>Branches: {formatCapacity(targetPlan.maxBranches)}</p>
                                <p>Employees: {formatCapacity(targetPlan.maxEmployees)}</p>
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

                    <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
                        {isDowngrade
                            ? 'If your current branch or employee usage exceeds the new plan limits, the change may be blocked.'
                            : 'Your subscription will be updated to the new plan on confirmation.'}
                    </div>
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
