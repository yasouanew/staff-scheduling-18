import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
    AlertTriangle,
    CheckCircle2,
    CreditCard,
    ExternalLink,
    FileText,
    RefreshCcw,
    Users,
} from 'lucide-react';

import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Button } from '@/Components/ui/button';
import { Badge } from '@/Components/ui/badge';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/Components/ui/card';
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@/Components/ui/tabs';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/Components/ui/dialog';
import { ErrorAlert } from '@/Components/common/ErrorAlert';
import { EmptyState } from '@/Components/common/EmptyState';
import { LoadingSkeleton } from '@/Components/common/LoadingSkeleton';
import { PageHeader } from '@/Components/common/PageHeader';
import { StatCard } from '@/Components/common/StatCard';
import { getApiErrorMessage } from '@/lib/api-client';
import { handleCapacityError } from '@/lib/capacity-errors';

import { useWebSession, WEB_SESSION_KEY } from '@/features/auth/hooks/useWebSession';
import { useSeatCapacity } from '@/features/billing/context/SeatCapacityContext';

import type { BillingPayment } from '@/types/billing';
import type { BillingCycle, ManagementPlan, SubscriptionSummary } from '../types';
import { formatCapacity, formatCyclePrice } from '../lib/format';
import { canManageBilling, canViewBilling } from '../lib/permissions';
import {
    getBillingErrorCode,
    isSubscriptionInvalidError,
} from '../lib/billing-errors';
import {
    useBillingPortal,
    useCancelSubscription,
    useChangeBillingPeriod,
    useConfirmCheckout,
    useDiscardIncompleteCheckout,
    useDowngradeSubscription,
    useManagementPlans,
    usePlanChangeEstimate,
    useResumeSubscription,
    useRetryCheckout,
    useSelfServiceCheckout,
    useSubscriptionInvoices,
    useSubscriptionSummary,
    useUpgradeSubscription,
    useUsageOverview,
} from '../hooks/useSubscription';
import { DowngradeConflictDialog } from '../components/DowngradeConflictDialog';
import { PlanCard } from '../components/PlanCard';
import { UpgradePlanDialog, isDowngradeDirection } from '../components/UpgradePlanDialog';

type BillingTab = 'overview' | 'plan' | 'usage' | 'billing' | 'invoices';

const CYCLE_OPTIONS: { value: BillingCycle; label: string }[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'six_month', label: '6 months' },
    { value: 'yearly', label: 'Yearly' },
];

/** Human-friendly subscription status label. */
function subscriptionStatusLabel(status: string | undefined): string {
    if (!status) return 'No active plan';
    return status
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Safe date formatter for ISO strings. */
function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    try {
        return format(parseISO(value), 'd MMM yyyy');
    } catch {
        return value;
    }
}

/** Presentational price for a plan on a given cycle (always sourced from the backend). */
function priceForCycle(
    plan: { priceMonthly: number; priceSixMonthly?: number | null; priceYearly: number },
    cycle: BillingCycle,
): number {
    if (cycle === 'six_month') return plan.priceSixMonthly ?? plan.priceMonthly;
    if (cycle === 'yearly') return plan.priceYearly;
    return plan.priceMonthly;
}

/** Status pill tone for a subscription/payment status. */
function statusTone(status: string | undefined): 'success' | 'warning' | 'danger' | 'info' {
    switch (status) {
        // Subscription statuses that grant access (SubscriptionStatus::grantsAccess()).
        case 'active':
        case 'trialing':
            return 'success';
        // Payment succeeded.
        case 'succeeded':
            return 'success';
        // Requires attention — payment overdue, suspended, or incomplete.
        case 'past_due':
        case 'failed':
        case 'incomplete':
        case 'expired':
            return 'danger';
        // Temporary/hold/attention states.
        case 'grace_period':
        case 'paused':
        case 'suspended':
        case 'pending':
        case 'cancelled':
        case 'canceled':
            return 'warning';
        default:
            return 'info';
    }
}

/** Read-only invoice/payment history table used by the Invoices tab. */
function InvoiceHistoryTable({
    invoices,
    isLoading,
    isError,
    page,
    lastPage,
    onPageChange,
}: {
    invoices: BillingPayment[] | undefined;
    isLoading: boolean;
    isError: boolean;
    page: number;
    lastPage: number;
    onPageChange: (next: number) => void;
}): JSX.Element {
    if (isError) {
        return (
            <ErrorAlert
                title="Could not load invoices"
                message="We couldn't retrieve your invoice history. Please try again."
            />
        );
    }

    if (isLoading) {
        return (
            <div className="space-y-3">
                <LoadingSkeleton className="h-10 w-full" />
                <LoadingSkeleton className="h-10 w-full" />
                <LoadingSkeleton className="h-10 w-full" />
            </div>
        );
    }

    if (!invoices || invoices.length === 0) {
        return (
            <EmptyState
                icon={FileText}
                title="No invoices yet"
                description="Once your first payment is processed, your invoices will appear here."
            />
        );
    }

    const money = (amount: number, currency: string): string => {
        try {
            return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amount);
        } catch {
            return `$${amount.toFixed(2)}`;
        }
    };

    return (
        <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full text-left text-sm">
                    <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                        <tr>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Amount</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Subscription</th>
                            <th className="px-4 py-3">Subscribed</th>
                            <th className="px-4 py-3">Expires</th>
                            <th className="px-4 py-3">Reference</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invoices.map((invoice) => (
                            <tr key={invoice.id} className="border-t border-border">
                                <td className="px-4 py-4 text-foreground">
                                    {invoice.paidAt ? formatDate(invoice.paidAt) : formatDate(invoice.refundedAt)}
                                </td>
                                <td className="px-4 py-4 font-medium text-foreground">
                                    {money(invoice.amount, invoice.currency)}
                                </td>
                                <td className="px-4 py-4">
                                    <Badge variant={statusTone(invoice.status)}>
                                        {invoice.status.replace(/_/g, ' ')}
                                    </Badge>
                                </td>
                                {/* Owning subscription state: "Expired" / "Active" / … */}
                                <td className="px-4 py-4">
                                    {invoice.subscription ? (
                                        <Badge variant={statusTone(invoice.subscription.status)}>
                                            {invoice.subscription.status.replace(/_/g, ' ')}
                                        </Badge>
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    )}
                                </td>
                                {/* Subscription period start date. */}
                                <td className="px-4 py-4 text-muted-foreground">
                                    {formatDate(invoice.subscription?.startsAt)}
                                </td>
                                {/* Subscription period end (expiry) date. */}
                                <td className="px-4 py-4 text-muted-foreground">
                                    {formatDate(invoice.subscription?.endsAt)}
                                </td>
                                <td className="px-4 py-4 text-muted-foreground">
                                    {invoice.reference ?? '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {lastPage > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        Page {page} of {lastPage}
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => onPageChange(page - 1)}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= lastPage}
                            onClick={() => onPageChange(page + 1)}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

/** Checkout dialog used when the business has no entitled subscription yet. */
function CheckoutDialog({
    open,
    plan,
    selectedCycle,
    seatUsed,
    isPending,
    onCycleChange,
    onOpenChange,
    onConfirm,
}: {
    open: boolean;
    plan: ManagementPlan | null;
    selectedCycle: BillingCycle;
    /** Active user accounts currently counted (authoritative seat usage). */
    seatUsed: number;
    isPending: boolean;
    onCycleChange: (cycle: BillingCycle) => void;
    onOpenChange: (open: boolean) => void;
    onConfirm: (plan: ManagementPlan, cycle: BillingCycle) => void;
}): JSX.Element {
    /*
     * Pre-flight seat check: a plan whose seat allowance is smaller than the
     * current active-user count can never be subscribed to (the backend rejects
     * it with `DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED`). Surface that before the
     * admin reaches Stripe — they must deactivate members or pick a larger plan.
     */
    const seatConflict = plan !== null && plan.maxSeats !== null && seatUsed > plan.maxSeats;
    const excess = seatConflict ? seatUsed - (plan?.maxSeats ?? seatUsed) : 0;
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Choose a subscription</DialogTitle>
                    <DialogDescription>
                        Review the plan and billing cycle below. You'll complete the payment securely in
                        Stripe Checkout.
                    </DialogDescription>
                </DialogHeader>

                {plan ? (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-border p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-base font-semibold text-foreground">{plan.name}</p>
                                    {plan.description ? (
                                        <p className="mt-0.5 text-sm text-muted-foreground">{plan.description}</p>
                                    ) : null}
                                </div>
                                <p className="shrink-0 text-lg font-semibold text-foreground">
                                    {formatCyclePrice(priceForCycle(plan, selectedCycle), plan.currency, selectedCycle)}
                                </p>
                            </div>

                            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                                <p className="text-muted-foreground">
                                    Active users (seats):{' '}
                                    <span className="font-medium text-foreground">{formatCapacity(plan.maxSeats)}</span>
                                </p>
                                <p className="text-muted-foreground">
                                    Currently used:{' '}
                                    <span className={seatConflict ? 'font-medium text-danger' : 'font-medium text-foreground'}>
                                        {seatUsed}
                                    </span>
                                </p>
                            </div>

                            {seatConflict && (
                                <div className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-foreground">
                                    <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
                                    <div className="space-y-1">
                                        <p className="font-medium text-foreground">
                                            {seatUsed} active users vs {formatCapacity(plan.maxSeats)} allowed
                                        </p>
                                        <p className="text-muted-foreground">
                                            Deactivate at least <span className="font-medium text-foreground">{excess}</span>{' '}
                                            {excess === 1 ? 'account' : 'accounts'} before subscribing, or choose a plan
                                            with enough seats.
                                        </p>
                                        <Link
                                            to="/employees"
                                            className="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                        >
                                            Manage members
                                        </Link>

                                    </div>
                                </div>
                            )}

                            {plan.features.length > 0 && (
                                <div className="mt-4 flex flex-wrap gap-1.5">
                                    {plan.features.map((feature) => (
                                        <Badge key={feature} variant="outline">{feature}</Badge>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <p className="mb-2 text-sm font-medium text-foreground">Billing cycle</p>
                            <div className="flex flex-wrap gap-2">
                                {CYCLE_OPTIONS.filter((option) => plan.interval.includes(option.value)).map((option) => (
                                    <Button
                                        key={option.value}
                                        type="button"
                                        variant={selectedCycle === option.value ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => onCycleChange(option.value)}
                                    >
                                        {option.label}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">Select a plan to continue.</p>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button
                        disabled={!plan || seatConflict}
                        loading={isPending}
                        loadingLabel="Redirecting to Stripe…"
                        onClick={() => {
                            if (plan) onConfirm(plan, selectedCycle);
                        }}
                    >
                        Continue to payment
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/**
 * Company management Subscription & Billing dashboard.
 *
 * Organised into six tabs (Overview / Plan / Usage / Branches / Billing /
 * Invoices). Every value comes from the backend self-service subscription
 * surface; this page never computes billing amounts. Actions are only shown
 * when the caller has permission and the state allows them.
 */
export default function SubscriptionDashboardPage(): JSX.Element {
    const webSession = useWebSession();
    const user = webSession.data;

    const canView = canViewBilling(user);
    const canManage = canManageBilling(user);

    const summary = useSubscriptionSummary();
    const usageOverview = useUsageOverview();
    const plansQuery = useManagementPlans();
    const seatCapacity = useSeatCapacity();

    const upgrade = useUpgradeSubscription();
    const downgrade = useDowngradeSubscription();
    const billingPortal = useBillingPortal();
    const checkout = useSelfServiceCheckout();
    const cancelSubscription = useCancelSubscription();
    const resumeSubscription = useResumeSubscription();
    const changeBillingPeriod = useChangeBillingPeriod();
    const confirmCheckout = useConfirmCheckout();
    const retryCheckout = useRetryCheckout();
    const discardIncomplete = useDiscardIncompleteCheckout();

    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const checkoutStatus = searchParams.get('checkout');
    const checkoutSessionId = searchParams.get('session_id');

    /* ------------------------------------------------------------------ */
    /* Stripe Checkout return handling                                      */
    /* ------------------------------------------------------------------ */
    //
    // Stripe redirects back to `/subscription?checkout=success&session_id=...`
    // after a completed payment (the backend success URL). When the webhook is
    // not configured the local subscription would otherwise stay `incomplete`
    // forever, so we confirm the session here: the backend activates the
    // subscription, records the invoice payment and unlocks the company. The
    // return URL is then stripped so a refresh never re-confirms.
    useEffect(() => {
        if (checkoutStatus !== 'success' || !checkoutSessionId) {
            return;
        }

        let cancelled = false;

        void confirmCheckout
            .mutateAsync(checkoutSessionId)
            .then(async () => {
                // Re-fetch the authoritative session so the header trial badge
                // and the /auth/me permission gate reflect the new state.
                await queryClient.invalidateQueries({ queryKey: WEB_SESSION_KEY });
                if (cancelled) return;
                navigate('/subscription', { replace: true });
                toast.success('Subscription activated', {
                    description: 'Thanks — your subscription is now active.',
                });
            })
            .catch((error) => {
                if (cancelled) return;
                navigate('/subscription', { replace: true });
                toast.error('Payment confirmation pending', {
                    description: getApiErrorMessage(
                        error,
                        "We couldn't confirm your payment yet. If you were charged it will appear here shortly.",
                    ),
                });
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [checkoutStatus, checkoutSessionId]);

    /* ------------------------------------------------------------------ */
    /* Local UI state                                                       */
    /* ------------------------------------------------------------------ */
    const [activeTab, setActiveTab] = useState<BillingTab>('overview');
    const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('monthly');
    const [planDialogOpen, setPlanDialogOpen] = useState(false);
    const [targetPlan, setTargetPlan] = useState<ManagementPlan | null>(null);

    const [checkoutPlan, setCheckoutPlan] = useState<ManagementPlan | null>(null);
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [checkoutCycle, setCheckoutCycle] = useState<BillingCycle>('monthly');

    const [cancelOpen, setCancelOpen] = useState(false);

    /*
     * Downgrade-conflict state: when a plan downgrade is rejected because the
     * company already has more active user accounts than the target plan allows,
     * we surface this non-blocking dialog pointing the admin at the directory.
     */
    const [downgradeConflict, setDowngradeConflict] = useState<{
        used: number;
        cap: number | null;
    } | null>(null);

    const [invoicePage, setInvoicePage] = useState(1);

    const [error, setError] = useState<string | null>(null);

    const invoices = useSubscriptionInvoices(invoicePage);

    /* ------------------------------------------------------------------ */
    /* Derived data                                                         */
    /* ------------------------------------------------------------------ */
    const plans = plansQuery.data ?? [];
    const data = summary.data;

    // Server-computed proration estimate for the plan-change dialog. Only
    // fetched while the dialog is open and the business has an entitled
    // subscription (fresh checkouts have nothing to prorate).
    const planChangeEstimate = usePlanChangeEstimate(
        planDialogOpen && data?.entitled ? targetPlan?.id ?? null : null,
        selectedCycle,
    );

    const currentPlan = data?.plan ?? null;
    const subscription = data?.subscription ?? null;
    /**
     * Features of the current plan, resolved from the summary's `features` array
     * (the backend returns the full enabled-feature set for the entitled plan).
     */
    const currentPlanFeatures =
        currentPlan === null
            ? []
            : data?.features?.filter((feature) => feature.enabled).map((feature) => feature.label) ?? [];
    /*
     * Active-user (seat) usage. A "seat" is one active, non-super-admin user
     * account in the company. The overview endpoint carries the authoritative
     * count/allowance; the summary's `usage.seats` is a fallback while it loads.
     */
    const seatUsed = usageOverview.data?.seats?.used ?? data?.usage?.seats?.used ?? 0;
    const seatLimit = usageOverview.data?.seats?.limit ?? data?.usage?.seats?.limit ?? null;
    const seatFull = seatLimit !== null && seatUsed >= seatLimit;

    const isPastDue = subscription?.status === 'past_due';
    const isCancelled = subscription?.isCancelled ?? false;
    const isExpired = subscription?.status === 'expired';
    /**
     * A Stripe Checkout was started but never paid — the row exists locally in
     * `incomplete` state. The admin must be able to finish the payment (fresh
     * session for the same plan/cycle) or discard the attempt.
     */
    const isIncomplete = subscription?.status === 'incomplete';

    /* ------------------------------------------------------------------ */
    /* Handlers                                                             */
    /* ------------------------------------------------------------------ */

    const handleSelectPlan = (plan: ManagementPlan): void => {
        // Without an entitled subscription the plan action is a fresh checkout,
        // not an in-place plan change.
        if (data && !data.entitled) {
            setCheckoutPlan(plan);
            setCheckoutCycle(selectedCycle);
            setCheckoutOpen(true);
            return;
        }
        setTargetPlan(plan);
        setPlanDialogOpen(true);
    };

    const handleConfirmPlanChange = async (plan: ManagementPlan): Promise<void> => {
        const isDown = isDowngradeDirection(data ?? null, plan);
        const mutation = isDown ? downgrade : upgrade;
        try {
            const result = await mutation.mutateAsync({ planId: plan.id, billingCycle: selectedCycle });

            setPlanDialogOpen(false);
            setTargetPlan(null);

            // No default card on file: the hook already forwarded the browser
            // to the hosted Checkout session for the prorated "rest of the
            // money" — the plan is applied once the payment completes.
            if (result.checkoutUrl) {
                toast.info('Redirecting to payment…', {
                    description: 'Complete the payment to finish switching your plan.',
                });
                return;
            }

            const formatMoney = (amount: number, currency: string): string =>
                `${amount.toFixed(2)} ${currency}`;

            if (isDown && result.refund) {
                toast.success('Plan downgraded', {
                    description: `${formatMoney(result.refund.amount, result.refund.currency)} refunded for the rest of your current billing period.`,
                });
                return;
            }

            if (!isDown && result.charge) {
                toast.success('Plan upgraded', {
                    description: `${formatMoney(result.charge.amount, result.charge.currency)} charged for the rest of your current billing period.`,
                });
                return;
            }

            toast.success(isDown ? 'Plan downgraded' : 'Plan upgraded');
        } catch (planError) {
            // A `422 DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED` means the target plan's
            // seat allowance is smaller than the current active-user count. The
            // backend's numbers are authoritative, so always refetch seats, then
            // surface the dedicated conflict dialog instead of a generic toast.
            const seatError = await handleCapacityError(planError, () => seatCapacity.refetch());
            if (seatError && seatError.code === 'DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED') {
                setPlanDialogOpen(false);
                setTargetPlan(null);
                setDowngradeConflict({
                    used: seatError.used ?? seatUsed,
                    cap: seatError.capacity ?? seatLimit,
                });
                return;
            }

            const code = getBillingErrorCode(planError);
            if (code === 'DOWNGRADE_BRANCH_LIMIT_EXCEEDED') {
                toast.error('Cannot change plan', {
                    description:
                        'Your current branch usage exceeds the new plan limits. Reduce usage first, then try again.',
                });
            } else if (isSubscriptionInvalidError(planError)) {
                toast.error('Subscription issue', {
                    description: 'Your subscription is expired or past due. Please renew it before changing plans.',
                });
            } else {
                toast.error('Unable to change plan', {
                    description: getApiErrorMessage(planError, 'Please try again.'),
                });
            }
        }
    };

    const handleCheckoutConfirm = async (plan: ManagementPlan, cycle: BillingCycle): Promise<void> => {
        try {
            const url = await checkout.mutateAsync({ planId: plan.id, billingCycle: cycle });
            setCheckoutOpen(false);
            setCheckoutPlan(null);
            // The Stripe session is created server-side; bounce the browser there.
            window.location.assign(url);
        } catch (checkoutError) {
            // A `422 DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED` means the target plan's
            // seat allowance is smaller than the current active-user count —
            // including the fresh-checkout path where the company has no
            // entitled subscription yet. The backend's numbers are authoritative,
            // so surface the dedicated conflict dialog instead of a generic toast.
            const seatError = await handleCapacityError(checkoutError, () => seatCapacity.refetch());
            if (seatError && seatError.code === 'DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED') {
                setCheckoutOpen(false);
                setCheckoutPlan(null);
                setDowngradeConflict({
                    used: seatError.used ?? seatUsed,
                    cap: seatError.capacity ?? seatLimit,
                });
                return;
            }

            const code = getBillingErrorCode(checkoutError);
            if (code === 'DOWNGRADE_BRANCH_LIMIT_EXCEEDED') {
                toast.error('Cannot subscribe to this plan', {
                    description:
                        'Your current branch usage exceeds the plan limits. Reduce usage first, then try again.',
                });
            } else {
                toast.error('Unable to start checkout', {
                    description: getApiErrorMessage(checkoutError, 'Please try again.'),
                });
            }
        }
    };

    /**
     * Resumes an abandoned checkout: closes the stale `incomplete` row and
     * redirects the browser to a fresh Stripe session for the same plan/cycle.
     */
    const handleRetryCheckout = async (): Promise<void> => {
        try {
            const url = await retryCheckout.mutateAsync();
            window.location.assign(url);
        } catch (retryError) {
            toast.error('Unable to resume checkout', {
                description: getApiErrorMessage(retryError, 'Please try again.'),
            });
        }
    };

    /** Abandons the pending `incomplete` checkout so any plan can be chosen. */
    const handleDiscardIncomplete = async (): Promise<void> => {
        try {
            await discardIncomplete.mutateAsync();
            toast.success('Pending checkout discarded', {
                description: 'You can now choose any plan from the catalogue.',
            });
        } catch (discardError) {
            toast.error('Unable to discard the pending checkout', {
                description: getApiErrorMessage(discardError, 'Please try again.'),
            });
        }
    };

    const handleOpenBillingPortal = async (): Promise<void> => {
        try {
            const url = await billingPortal.mutateAsync();
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (portalError) {
            toast.error('Unable to open billing portal', {
                description: getApiErrorMessage(portalError, 'Please try again.'),
            });
        }
    };

    const handleCancelConfirm = async (): Promise<void> => {
        try {
            await cancelSubscription.mutateAsync({});
            setCancelOpen(false);
            toast.success('Subscription cancelled', {
                description: 'Your subscription will end at the end of the current billing period.',
            });
        } catch (cancelError) {
            toast.error('Unable to cancel subscription', {
                description: getApiErrorMessage(cancelError, 'Please try again.'),
            });
        }
    };

    const handleResume = async (): Promise<void> => {
        try {
            await resumeSubscription.mutateAsync();
            toast.success('Subscription resumed');
        } catch (resumeError) {
            toast.error('Unable to resume subscription', {
                description: getApiErrorMessage(resumeError, 'Please try again.'),
            });
        }
    };

    const handleCycleChange = async (cycle: BillingCycle): Promise<void> => {
        if (cycle === subscription?.billingCycle) return;
        try {
            await changeBillingPeriod.mutateAsync(cycle);
            toast.success('Billing cycle updated');
        } catch (cycleError) {
            toast.error('Unable to update billing cycle', {
                description: getApiErrorMessage(cycleError, 'Please try again.'),
            });
        }
    };

    /* ------------------------------------------------------------------ */
    /* Permission gate                                                      */
    /* ------------------------------------------------------------------ */
    if (webSession.isLoading) {
        return (
            <div className="space-y-6">
                <LoadingSkeleton className="h-8 w-64" />
                <LoadingSkeleton className="h-32 w-full" />
            </div>
        );
    }

    if (!canView) {
        return (
            <div className="space-y-6">
                <PageHeader title="Subscription & Billing" eyebrow="Billing" />
                <EmptyState
                    icon={CreditCard}
                    title="No billing access"
                    description="You don't have permission to view subscription and billing information."
                />
            </div>
        );
    }

    if (summary.isLoading || plansQuery.isLoading) {
        return (
            <div className="space-y-6">
                <PageHeader title="Subscription & Billing" eyebrow="Billing" />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[0, 1, 2, 3].map((i) => (
                        <LoadingSkeleton key={i} className="h-28 w-full" />
                    ))}
                </div>
                <LoadingSkeleton className="h-64 w-full" />
            </div>
        );
    }

    if (summary.isError) {
        return (
            <div className="space-y-6">
                <PageHeader title="Subscription & Billing" eyebrow="Billing" />
                <ErrorAlert
                    title={isSubscriptionInvalidError(summary.error) ? 'Subscription issue' : 'Could not load billing'}
                    message={
                        isSubscriptionInvalidError(summary.error)
                            ? 'Your subscription is expired or past due. Please renew it to continue using your workspace.'
                            : getApiErrorMessage(summary.error, 'Please try again.')
                    }
                />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Billing"
                title="Subscription & Billing"
                description="Manage your plan, active-user seats and billing across your workspace."
            />

            {error && (
                <ErrorAlert
                    variant="warning"
                    title="Something needs attention"
                    message={error}
                    onDismiss={() => setError(null)}
                />
            )}

            {/* Payment failure banner (visible on every tab while past due). */}
            {isPastDue && (
                <section className="flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger/5 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
                        <div className="space-y-1">
                            <h2 className="text-base font-semibold tracking-tight text-foreground">
                                We couldn't process your latest payment.
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Your subscription is past due. Update your payment method to avoid any disruption
                                to your workspace.
                            </p>
                        </div>
                    </div>
                    {canManage && (
                        <Button
                            variant="destructive"
                            loading={billingPortal.isPending}
                            loadingLabel="Opening portal…"
                            onClick={handleOpenBillingPortal}
                        >
                            Update Payment Method
                        </Button>
                    )}
                </section>
            )}

            {/* Unfinished-checkout banner: the payment was never completed. */}
            {isIncomplete && (
                <section className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/5 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                        <div className="space-y-1">
                            <h2 className="text-base font-semibold tracking-tight text-foreground">
                                Your payment wasn't completed.
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                A checkout for the {data?.plan?.name ?? 'selected'} plan was started but never paid,
                                so it is not active yet. Complete the payment to activate it, or discard the attempt
                                and choose a different plan.
                            </p>
                        </div>
                    </div>
                    {canManage && (
                        <div className="flex shrink-0 gap-2">
                            <Button
                                variant="outline"
                                loading={discardIncomplete.isPending}
                                loadingLabel="Discarding…"
                                onClick={handleDiscardIncomplete}
                            >
                                Discard
                            </Button>
                            <Button
                                loading={retryCheckout.isPending}
                                loadingLabel="Redirecting to Stripe…"
                                onClick={handleRetryCheckout}
                            >
                                Complete payment
                            </Button>
                        </div>
                    )}
                </section>
            )}

            {/* Expired subscription banner with the billing portal link. */}
            {isExpired && (
                <section className="flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger/5 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
                        <div className="space-y-1">
                            <h2 className="text-base font-semibold tracking-tight text-foreground">
                                Your subscription expired on {formatDate(subscription?.endsAt)}.
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Renew from the billing portal or choose a new plan to restore access. Your previous
                                subscription records and invoices are listed below.
                            </p>
                        </div>
                    </div>
                    {canManage && (
                        <Button
                            variant="destructive"
                            loading={billingPortal.isPending}
                            loadingLabel="Opening portal…"
                            onClick={handleOpenBillingPortal}
                        >
                            Open billing portal
                        </Button>
                    )}
                </section>
            )}

            {/* Activation banner (no entitled subscription). */}
            {data && !data.entitled ? (
                <section className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <h2 className="text-base font-semibold tracking-tight text-foreground">Activate your subscription</h2>
                        <p className="text-sm text-muted-foreground">
                            Choose a plan and complete payment to unlock scheduling across your branches.
                        </p>
                    </div>
                    <Button size="lg" onClick={() => setActiveTab('plan')}>
                        Choose a subscription
                    </Button>
                </section>
            ) : null}

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as BillingTab)} className="w-full">
                <TabsList className="h-auto flex-wrap gap-1 bg-muted/60">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="plan">Plan</TabsTrigger>
                    <TabsTrigger value="usage">Usage</TabsTrigger>
                    <TabsTrigger value="billing">Billing</TabsTrigger>
                    <TabsTrigger value="invoices">Invoices</TabsTrigger>
                </TabsList>

                {/* ------------------------------------------------------------------ */}
                {/* OVERVIEW                                                              */}
                {/* ------------------------------------------------------------------ */}
                <TabsContent value="overview" className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard
                            title="Current plan"
                            value={data?.plan?.name ?? 'No active plan'}
                            icon={CreditCard}
                            tone="primary"
                            description={subscriptionStatusLabel(subscription?.status)}
                        />
                        <StatCard
                            title="Subscription status"
                            value={subscription ? subscriptionStatusLabel(subscription.status) : 'Inactive'}
                            icon={CheckCircle2}
                            tone={statusTone(subscription?.status)}
                            description={subscription?.billingCycle ? `${subscription.billingCycle.replace('_', ' ')} billing` : 'No billing cycle'}
                        />
                        <StatCard
                            title="Active users (seats)"
                            value={seatLimit === null ? String(seatUsed) : `${seatUsed} / ${seatLimit}`}
                            icon={Users}
                            tone={seatFull ? 'danger' : 'success'}
                            description={
                                seatLimit === null
                                    ? 'Unlimited user accounts'
                                    : seatFull
                                        ? 'plan limit reached'
                                        : 'active user accounts'
                            }
                        />
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Subscription details</CardTitle>
                            <CardDescription>Your current billing arrangement and renewal timeline.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <div>
                                    <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Billing cycle</dt>
                                    <dd className="mt-1 text-sm font-medium text-foreground">
                                        {subscription?.billingCycle ? subscription.billingCycle.replace('_', ' ') : '—'}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Next billing date</dt>
                                    <dd className="mt-1 text-sm font-medium text-foreground">
                                        {formatDate(subscription?.renewsAt ?? subscription?.endsAt ?? subscription?.trialEndsAt)}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Trial status</dt>
                                    <dd className="mt-1 text-sm font-medium text-foreground">
                                        {data?.trial?.active
                                            ? `Trial ends ${formatDate(data.trial.trialEndsAt)}`
                                            : subscription?.onTrial
                                                ? 'Trial active'
                                                : 'Not on trial'}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cancellation</dt>
                                    <dd className="mt-1 text-sm font-medium text-foreground">
                                        {isCancelled ? `Cancelled ${formatDate(subscription?.cancelledAt)}` : 'Active'}
                                    </dd>
                                </div>
                            </dl>

                            <div className="mt-6 flex flex-wrap gap-3">
                                {data?.entitled && canManage && (
                                    <Button
                                        variant="outline"
                                        loading={billingPortal.isPending}
                                        loadingLabel="Opening portal…"
                                        onClick={handleOpenBillingPortal}
                                    >
                                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                                        Billing portal
                                    </Button>
                                )}
                                {isCancelled && canManage && (
                                    <Button
                                        variant="default"
                                        loading={resumeSubscription.isPending}
                                        loadingLabel="Resuming…"
                                        onClick={handleResume}
                                    >
                                        <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                                        Resume subscription
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Previous subscription records (including expired ones). */}
                    {data?.subscriptionHistory && data.subscriptionHistory.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Subscription history</CardTitle>
                                <CardDescription>
                                    Every subscription record for your workspace, including expired periods.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto rounded-xl border border-border">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                                            <tr>
                                                <th className="px-4 py-3">Plan</th>
                                                <th className="px-4 py-3">Status</th>
                                                <th className="px-4 py-3">Cycle</th>
                                                <th className="px-4 py-3">Subscribed</th>
                                                <th className="px-4 py-3">Expired / Ended</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.subscriptionHistory.map((record) => (
                                                <tr key={record.id} className="border-t border-border">
                                                    <td className="px-4 py-3 font-medium text-foreground">
                                                        {record.planName ?? '—'}
                                                        {record.isCurrent && (
                                                            <Badge variant="primary" className="ml-2">Current</Badge>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <Badge variant={statusTone(record.status)}>
                                                            {record.status.replace(/_/g, ' ')}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-4 py-3 text-muted-foreground">
                                                        {record.billingCycle.replace('_', ' ')}
                                                    </td>
                                                    <td className="px-4 py-3 text-muted-foreground">
                                                        {formatDate(record.startsAt)}
                                                    </td>
                                                    <td className="px-4 py-3 text-muted-foreground">
                                                        {formatDate(record.endsAt)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                {/* ------------------------------------------------------------------ */}
                {/* PLAN                                                                  */}
                {/* ------------------------------------------------------------------ */}
                <TabsContent value="plan" className="space-y-6">
                    {data?.entitled && currentPlan && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    {currentPlan.name}
                                    <Badge variant="primary">Current plan</Badge>
                                </CardTitle>
                                <CardDescription>
                                    {formatCyclePrice(priceForCycle(currentPlan, subscription?.billingCycle ?? 'monthly'), currentPlan.currency, subscription?.billingCycle ?? 'monthly')}
                                    {' · '}
                                    {formatCapacity(currentPlan.maxSeats)} active users
                                </CardDescription>
                            </CardHeader>
                            {currentPlanFeatures.length > 0 && (
                                <CardContent>
                                    <div className="flex flex-wrap gap-1.5">
                                        {currentPlanFeatures.map((feature) => (
                                            <Badge key={feature} variant="outline">{feature}</Badge>
                                        ))}
                                    </div>
                                </CardContent>
                            )}
                        </Card>
                    )}

                    <section className="space-y-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                                    {data?.entitled ? 'Available plans' : 'Choose your plan'}
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    {isIncomplete
                                        ? 'Your last checkout was not paid. Complete the payment for your previous plan or discard it and pick another.'
                                        : isExpired
                                            ? 'Your subscription has expired. Renew your previous plan or choose a new one to restore access.'
                                            : data?.entitled
                                                ? 'Compare plans and switch when your needs change.'
                                                : 'Select a plan to begin your subscription.'}
                                </p>
                            </div>
                            {!canManage && data?.entitled && (
                                <p className="text-xs text-muted-foreground">
                                    Contact your administrator to change plans.
                                </p>
                            )}
                        </div>

                        {plans.length === 0 ? (
                            <EmptyState
                                icon={CreditCard}
                                title="No plans available"
                                description="No plans are currently available to subscribe to. Please check back soon."
                            />
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                {plans.map((plan) => (
                                    <PlanCard
                                        key={plan.id}
                                        plan={plan}
                                        isCurrent={currentPlan?.id === plan.id}
                                        isRenewable={(isExpired || isIncomplete) && currentPlan?.id === plan.id}
                                        renewalLabel={isIncomplete ? 'Payment pending' : undefined}
                                        canManage={canManage || !data?.entitled}
                                        selectedCycle={selectedCycle}
                                        onCycleChange={(cycle) => setSelectedCycle(cycle as BillingCycle)}
                                        onSelect={handleSelectPlan}
                                    />
                                ))}
                            </div>
                        )}
                    </section>
                </TabsContent>

                {/* ------------------------------------------------------------------ */}
                {/* USAGE                                                                  */}
                {/* ------------------------------------------------------------------ */}
                <TabsContent value="usage" className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard
                            title="Active users (seats)"
                            value={seatLimit === null ? String(seatUsed) : `${seatUsed} / ${seatLimit}`}
                            icon={Users}
                            tone={seatFull ? 'danger' : 'success'}
                            description={
                                seatLimit === null
                                    ? 'Unlimited user accounts'
                                    : seatFull
                                        ? 'plan seat limit reached'
                                        : 'active user accounts'
                            }
                        />
                        <StatCard
                            title="Remaining seats"
                            value={seatLimit === null ? 'Unlimited' : String(Math.max(seatLimit - seatUsed, 0))}
                            icon={CheckCircle2}
                            tone={seatLimit !== null && seatFull ? 'danger' : 'success'}
                            description={
                                seatLimit === null
                                    ? 'No seat limit on your plan'
                                    : 'user accounts you can still activate'
                            }
                        />
                    </div>

                </TabsContent>

                {/* ------------------------------------------------------------------ */}
                {/* BILLING                                                                */}
                {/* ------------------------------------------------------------------ */}
                <TabsContent value="billing" className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard
                            title="Payment status"
                            value={subscription ? subscriptionStatusLabel(subscription.status) : 'Inactive'}
                            icon={CheckCircle2}
                            tone={statusTone(subscription?.status)}
                            description={isPastDue ? 'Action required' : 'up to date'}
                        />
                        <StatCard
                            title="Next billing date"
                            value={formatDate(subscription?.renewsAt ?? subscription?.endsAt ?? subscription?.trialEndsAt)}
                            icon={RefreshCcw}
                            tone="warning"
                            description={data?.trial?.active ? 'trial period' : 'billing cycle'}
                        />
                        <StatCard
                            title="Billing cycle"
                            value={subscription?.billingCycle ? subscription.billingCycle.replace('_', ' ') : '—'}
                            icon={CreditCard}
                            tone="info"
                            description="how often you're billed"
                        />
                        <StatCard
                            title="Payment method"
                            value={data?.entitled ? 'On file' : 'Not set'}
                            icon={CreditCard}
                            tone={data?.entitled ? 'success' : 'warning'}
                            description="manage in the billing portal"
                        />
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Manage billing</CardTitle>
                            <CardDescription>
                                Update your payment method, view card details and handle payment-related requests in
                                the secure billing portal.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {data?.entitled && canManage && (
                                <Button
                                    variant="default"
                                    loading={billingPortal.isPending}
                                    loadingLabel="Opening portal…"
                                    onClick={handleOpenBillingPortal}
                                >
                                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                                    Open billing portal
                                </Button>
                            )}

                            {data?.entitled && canManage && (
                                <div>
                                    <p className="mb-2 text-sm font-medium text-foreground">Change billing cycle</p>
                                    <div className="flex flex-wrap gap-2">
                                        {CYCLE_OPTIONS.map((option) => (
                                            <Button
                                                key={option.value}
                                                type="button"
                                                variant={subscription?.billingCycle === option.value ? 'default' : 'outline'}
                                                size="sm"
                                                disabled={changeBillingPeriod.isPending}
                                                onClick={() => handleCycleChange(option.value)}
                                            >
                                                {option.label}
                                            </Button>
                                        ))}
                                    </div>
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        Switching cycle applies to your next billing period.
                                    </p>
                                </div>
                            )}

                            {isCancelled && canManage ? (
                                <Button
                                    variant="default"
                                    loading={resumeSubscription.isPending}
                                    loadingLabel="Resuming…"
                                    onClick={handleResume}
                                >
                                    <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                                    Resume subscription
                                </Button>
                            ) : (
                                data?.entitled && canManage && (
                                    <Button variant="outline" onClick={() => setCancelOpen(true)}>
                                        Cancel subscription
                                    </Button>
                                )
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ------------------------------------------------------------------ */}
                {/* INVOICES                                                               */}
                {/* ------------------------------------------------------------------ */}
                <TabsContent value="invoices" className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold tracking-tight text-foreground">Invoices</h2>
                            <p className="text-sm text-muted-foreground">
                                Your billing history, including each invoice's subscription status and period dates.
                            </p>
                        </div>
                        {canManage && (
                            <Button
                                variant="outline"
                                loading={billingPortal.isPending}
                                loadingLabel="Opening portal…"
                                onClick={handleOpenBillingPortal}
                            >
                                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                                Billing portal
                            </Button>
                        )}
                    </div>
                    <InvoiceHistoryTable
                        invoices={invoices.data?.data}
                        isLoading={invoices.isLoading}
                        isError={invoices.isError}
                        page={invoicePage}
                        lastPage={invoices.data?.lastPage ?? 1}
                        onPageChange={setInvoicePage}
                    />
                </TabsContent>
            </Tabs>

            {/* Dialogs */}
            <UpgradePlanDialog
                open={planDialogOpen}
                summary={data ?? null}
                targetPlan={targetPlan}
                selectedCycle={selectedCycle}
                estimate={planChangeEstimate.data ?? null}
                isDowngrade={isDowngradeDirection(data ?? null, targetPlan)}
                isPending={upgrade.isPending || downgrade.isPending}
                onOpenChange={(next) => {
                    setPlanDialogOpen(next);
                    if (!next) setTargetPlan(null);
                }}
                onConfirm={handleConfirmPlanChange}
            />

            {/* Shown when a downgrade is rejected because the company has more
                active user accounts than the target plan allows. */}
            <DowngradeConflictDialog
                open={downgradeConflict !== null}
                used={downgradeConflict?.used ?? seatUsed}
                cap={downgradeConflict?.cap ?? seatLimit}
                onOpenChange={(next) => {
                    if (!next) setDowngradeConflict(null);
                }}
            />

            <CheckoutDialog
                open={checkoutOpen}
                plan={checkoutPlan}
                selectedCycle={checkoutCycle}
                seatUsed={seatUsed}
                isPending={checkout.isPending}
                onCycleChange={setCheckoutCycle}
                onOpenChange={(next) => {
                    setCheckoutOpen(next);
                    if (!next) setCheckoutPlan(null);
                }}
                onConfirm={handleCheckoutConfirm}
            />

            {/* Cancel subscription confirmation */}
            <AlertDialog.Root open={cancelOpen} onOpenChange={setCancelOpen}>
                <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
                    <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-lg focus:outline-none">
                        <AlertDialog.Title className="text-lg font-semibold text-foreground">
                            Cancel subscription?
                        </AlertDialog.Title>
                        <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                            Your subscription will remain active until the end of the current billing period, then
                            it will be cancelled. You can resume it at any time before then.
                        </AlertDialog.Description>
                        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <AlertDialog.Cancel asChild>
                                <Button variant="outline" disabled={cancelSubscription.isPending}>
                                    Keep subscription
                                </Button>
                            </AlertDialog.Cancel>
                            <AlertDialog.Action asChild>
                                <Button
                                    variant="destructive"
                                    loading={cancelSubscription.isPending}
                                    loadingLabel="Cancelling…"
                                    onClick={handleCancelConfirm}
                                >
                                    Cancel subscription
                                </Button>
                            </AlertDialog.Action>
                        </div>
                    </AlertDialog.Content>
                </AlertDialog.Portal>
            </AlertDialog.Root>
        </div>
    );
}
