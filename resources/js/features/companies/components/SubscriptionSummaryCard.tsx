import { format, parseISO } from 'date-fns';
import { CreditCard, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { CompanySubscription } from '@/types/company';

interface SubscriptionSummaryCardProps {
    /** The company's current subscription, or `null` when none exists. */
    subscription: CompanySubscription | null;
    /** Renders a skeleton while the subscription query is loading. */
    isLoading?: boolean;
}

/** Human-friendly label + semantic tone for a subscription state. */
function resolveTone(subscription: CompanySubscription): {
    label: string;
    classes: string;
    dot: string;
} {
    if (subscription.isCancelled) {
        return {
            label: 'Cancelled',
            classes: 'bg-muted text-muted-foreground',
            dot: 'bg-muted-foreground',
        };
    }
    if (subscription.onTrial) {
        return { label: 'Trial', classes: 'bg-info/10 text-info', dot: 'bg-info' };
    }
    if (subscription.isActive) {
        return { label: 'Active', classes: 'bg-success/10 text-success', dot: 'bg-success' };
    }
    return { label: subscription.status, classes: 'bg-warning/10 text-warning', dot: 'bg-warning' };
}

/** Formats an ISO date, gracefully falling back to an em dash. */
function formatDate(value: string | null): string {
    if (!value) {
        return '—';
    }
    try {
        return format(parseISO(value), 'dd MMM yyyy');
    } catch {
        return '—';
    }
}

/** A single label/value row within the card. */
function Row({ label, value }: { label: string; value: string }): JSX.Element {
    return (
        <div className="flex items-center justify-between gap-4 py-2">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-right text-sm font-medium text-foreground">{value}</dd>
        </div>
    );
}

/**
 * Current-subscription summary for the company detail page. Surfaces the
 * `subscription_id` relation as a readable card: plan, status, billing cadence
 * and the key billing dates. Handles the "no subscription yet" edge case with a
 * dedicated empty state, and a skeleton while loading.
 */
export function SubscriptionSummaryCard({
    subscription,
    isLoading = false,
}: SubscriptionSummaryCardProps): JSX.Element {
    return (
        <section
            aria-labelledby="subscription-heading"
            className="rounded-xl border border-border bg-card p-6 shadow-sm"
        >
            <div className="mb-4 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CreditCard className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 id="subscription-heading" className="text-base font-semibold text-foreground">
                    Current subscription
                </h2>
            </div>

            {isLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <div
                            key={index}
                            className="h-5 w-full animate-pulse rounded bg-muted"
                            aria-hidden="true"
                        />
                    ))}
                    <span className="sr-only">Loading subscription…</span>
                </div>
            ) : subscription ? (
                <>
                    <div className="mb-2 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                            <span className="text-sm font-semibold text-foreground">
                                {subscription.planName ?? 'Custom plan'}
                            </span>
                        </div>
                        {(() => {
                            const tone = resolveTone(subscription);
                            return (
                                <span
                                    className={cn(
                                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize',
                                        tone.classes,
                                    )}
                                >
                                    <span
                                        className={cn('h-1.5 w-1.5 rounded-full', tone.dot)}
                                        aria-hidden="true"
                                    />
                                    {tone.label}
                                </span>
                            );
                        })()}
                    </div>

                    <dl className="divide-y divide-border">
                        <Row
                            label="Billing cycle"
                            value={subscription.billingCycle ?? 'Not set'}
                        />
                        <Row label="Started" value={formatDate(subscription.startsAt)} />
                        {subscription.onTrial && (
                            <Row label="Trial ends" value={formatDate(subscription.trialEndsAt)} />
                        )}
                        <Row label="Renews / ends" value={formatDate(subscription.endsAt)} />
                    </dl>
                </>
            ) : (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/40 p-6 text-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <CreditCard className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <p className="text-sm font-medium text-foreground">No active subscription</p>
                    <p className="text-sm text-muted-foreground">
                        This company is not currently linked to a subscription plan.
                    </p>
                </div>
            )}
        </section>
    );
}
