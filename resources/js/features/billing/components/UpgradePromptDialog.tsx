import { ArrowRight, Sparkles, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/Components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/Components/ui/dialog';

import { useManagementPlans } from '../hooks/useSubscription';
import { formatCapacity, formatCyclePrice } from '../lib/format';
import type { ManagementPlan } from '../types';

interface UpgradePromptDialogProps {
    /**
     * Whether the dialog is visible. When closed, `seatsNeeded` is ignored.
     */
    open: boolean;
    /**
     * Minimum number of active-user seats required (typically the current
     * `used` plus the one being activated). The dialog only recommends plans
     * whose `maxSeats` is at least this value.
     */
    seatsNeeded: number;
    /**
     * The cycle shown on the recommended plan cards. Kept in sync with the
     * Subscription Dashboard's selection when reachable.
     */
    selectedCycle: string;
    onOpenChange: (open: boolean) => void;
}

/**
 * Upgrade prompt shown when a company_admin tries to activate a user account
 * while the current plan's active-user seat allowance is exhausted.
 *
 * Rather than owning billing state itself, the dialog fetches the same live
 * plan catalogue the Subscription Dashboard reads (`useManagementPlans`) and
 * deep-links the admin to the Plan tab (which already owns checkout / plan
 * change flow) for whichever plan fits. Rendering under the Employee
 * directory's isolated QueryClient is fine — this query runs on that client.
 */
export function UpgradePromptDialog({
    open,
    seatsNeeded,
    selectedCycle,
    onOpenChange,
}: UpgradePromptDialogProps): JSX.Element {
    const plansQuery = useManagementPlans();

    const eligible =
        (plansQuery.data ?? [])
            .filter((plan) => plan.maxSeats === null || plan.maxSeats >= seatsNeeded)
            .sort((a, b) => (a.maxSeats ?? Infinity) - (b.maxSeats ?? Infinity));

    // Best effort: list as many candidate plans as the catalogue holds, capped
    // so a tall catalogue does not overflow the modal.
    const candidates = eligible.slice(0, 3);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>You've reached your active-user limit</DialogTitle>
                    <DialogDescription>
                        Your current plan allows fewer active user accounts than you need. Upgrade to a
                        plan that covers{' '}
                        <span className="font-medium text-foreground">{seatsNeeded} seats</span> to keep
                        adding team members.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
                    <Users className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                    <p>
                        A seat is one active user account — company admins, schedulers and employees all
                        count, whether or not they have a profile.
                    </p>
                </div>

                {plansQuery.isLoading ? (
                    <div className="space-y-2">
                        <div className="h-16 animate-pulse rounded-lg bg-muted" />
                        <div className="h-16 animate-pulse rounded-lg bg-muted" />
                    </div>
                ) : candidates.length > 0 ? (
                    <div className="space-y-2">
                        {candidates.map((plan: ManagementPlan) => (
                            <div
                                key={plan.id}
                                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-4"
                            >
                                <div className="min-w-0">
                                    <p className="flex items-center gap-1.5 font-semibold text-foreground">
                                        {plan.name}
                                        <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
                                    </p>
                                    <p className="truncate text-sm text-muted-foreground">
                                        {formatCapacity(plan.maxSeats)}{' '}
                                        {plan.maxSeats === null ? 'active users (unlimited)' : 'active users'}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <span className="text-sm font-medium text-foreground">
                                        {formatCyclePrice(
                                            plan.priceMonthly,
                                            plan.currency,
                                            selectedCycle,
                                        )}
                                    </span>
                                    <Link
                                        to="/subscription?tab=plan"
                                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        Choose
                                        <ArrowRight className="size-3.5" aria-hidden="true" />
                                    </Link>
                                </div>
                            </div>
                        ))}
                        {eligible.length > candidates.length && (
                            <Link
                                to="/subscription?tab=plan"
                                className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                View all plans
                            </Link>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        No plans are currently available. Contact support or check back soon.
                    </p>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
