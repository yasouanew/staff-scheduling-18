import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
    AlertTriangle,
    Building2,
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

import { useWebSession, WEB_SESSION_KEY } from '@/features/auth/hooks/useWebSession';

import type { BillingPayment } from '@/types/billing';
import type { BranchUsageItem, BillingCycle, ManagementPlan, SubscriptionSummary } from '../types';
import { formatCapacity, formatCyclePrice } from '../lib/format';
import { canManageBilling, canManageBranchBilling, canViewBilling } from '../lib/permissions';
import {
    getBillingErrorCode,
    isBranchLimitReachedError,
    isCapacityReachedError,
    isSubscriptionInvalidError,
} from '../lib/billing-errors';
import {
    useBillingPortal,
    useCancelSubscription,
    useChangeBillingPeriod,
    useConfirmCheckout,
    useDowngradeSubscription,
    useManagementPlans,
    useResumeSubscription,
    useSelfServiceCheckout,
    useSubscriptionInvoices,
    useSubscriptionSummary,
    useUpgradeSubscription,
    useUsageOverview,
} from '../hooks/useSubscription';
import {
    useActivateBranch,
    useDeactivateBranch,
    useUpdateBranchCapacity,
} from '../hooks/useBranchBilling';
import { BranchCapacityDialog } from '../components/BranchCapacityDialog';
import { BranchUsageCard } from '../components/BranchUsageCard';
import { PlanCard } from '../components/PlanCard';
import { UpgradePlanDialog, isDowngradeDirection } from '../components/UpgradePlanDialog';

type BillingTab = 'overview' | 'plan' | 'usage' | 'branches' | 'billing' | 'invoices';

const CYCLE_OPTIONS: { value: BillingCycle; label: string }[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'six_month', label: '6 months' },
    { value: 'yearly', label: 'Yearly' },
];

/** Branch capacity a plan allows per branch (hint only; backend is authoritative). */
function planBranchCapacity(plan: { maxEmployees: number | null } | null, current: number | null): number | null {
    if (current !== null) return current;
    return plan?.maxEmployees ?? null;
}

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
    isPending,
    onCycleChange,
    onOpenChange,
    onConfirm,
}: {
    open: boolean;
    plan: ManagementPlan | null;
    selectedCycle: BillingCycle;
    isPending: boolean;
    onCycleChange: (cycle: BillingCycle) => void;
    onOpenChange: (open: boolean) => void;
    onConfirm: (plan: ManagementPlan, cycle: BillingCycle) => void;
}): JSX.Element {
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
                                    Branches:{' '}
                                    <span className="font-medium text-foreground">{formatCapacity(plan.maxBranches)}</span>
                                </p>
                                <p className="text-muted-foreground">
                                    Employees:{' '}
                                    <span className="font-medium text-foreground">{formatCapacity(plan.maxEmployees)}</span>
                                </p>
                            </div>

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
                        disabled={!plan}
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
    const canManageBranch = canManageBranchBilling(user);

    const summary = useSubscriptionSummary();
    const usageOverview = useUsageOverview();
    const plansQuery = useManagementPlans();

    const activateBranch = useActivateBranch();
    const deactivateBranch = useDeactivateBranch();
    const updateCapacity = useUpdateBranchCapacity();
    const upgrade = useUpgradeSubscription();
    const downgrade = useDowngradeSubscription();
    const billingPortal = useBillingPortal();
    const checkout = useSelfServiceCheckout();
    const cancelSubscription = useCancelSubscription();
    const resumeSubscription = useResumeSubscription();
    const changeBillingPeriod = useChangeBillingPeriod();
    const confirmCheckout = useConfirmCheckout();

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

    const [capacityBranch, setCapacityBranch] = useState<BranchUsageItem | null>(null);
    const [capacityOpen, setCapacityOpen] = useState(false);

    const [deactivateTarget, setDeactivateTarget] = useState<BranchUsageItem | null>(null);
    const [cancelOpen, setCancelOpen] = useState(false);

    const [invoicePage, setInvoicePage] = useState(1);

    const [error, setError] = useState<string | null>(null);

    const invoices = useSubscriptionInvoices(invoicePage);

    /* ------------------------------------------------------------------ */
    /* Derived data                                                         */
    /* ------------------------------------------------------------------ */
    const plans = plansQuery.data ?? [];
    const data = summary.data;

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
    /**
     * Branch usage comes from the dedicated `GET /subscription/usage` endpoint,
     * which carries `name`/`active` for every branch. The summary's `branch_usage`
     * (`UsageService::usageFor()`) is name-less, so it is only a fallback while the
     * richer query is loading.
     */
    const usageFromOverview: BranchUsageItem[] = usageOverview.data?.branchesUsage ?? [];
    const branchUsage: BranchUsageItem[] =
        usageFromOverview.length > 0 ? usageFromOverview : (data?.usage?.branchUsage ?? []);
    const activeBranches = usageOverview.data?.branches?.used ?? data?.usage?.branches?.used ?? 0;
    const branchLimit = usageOverview.data?.branches?.limit ?? data?.usage?.branches?.limit ?? null;
    const branchLimitReached = branchLimit !== null && activeBranches >= branchLimit;

    const totalEmployees = branchUsage.reduce((sum, branch) => sum + branch.employeesUsed, 0);
    const capacityLimit = currentPlan?.maxEmployees ?? null;

    const isPastDue = subscription?.status === 'past_due';
    const isCancelled = subscription?.isCancelled ?? false;

    const busy = activateBranch.isPending || deactivateBranch.isPending || updateCapacity.isPending;

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
            await mutation.mutateAsync({ planId: plan.id, billingCycle: selectedCycle });
            setPlanDialogOpen(false);
            setTargetPlan(null);
            toast.success(isDown ? 'Plan downgraded' : 'Plan upgraded');
        } catch (planError) {
            const code = getBillingErrorCode(planError);
            if (code === 'DOWNGRADE_BRANCH_LIMIT_EXCEEDED' || code === 'DOWNGRADE_EMPLOYEE_LIMIT_EXCEEDED') {
                toast.error('Cannot change plan', {
                    description:
                        'Your current branch or employee usage exceeds the new plan limits. Reduce usage first, then try again.',
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
            toast.error('Unable to start checkout', {
                description: getApiErrorMessage(checkoutError, 'Please try again.'),
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

    const handleActivate = (branch: BranchUsageItem): void => {
        setCapacityBranch(branch);
        setCapacityOpen(true);
    };

    const handleActivateConfirm = async (employeeCapacity: number): Promise<void> => {
        if (!capacityBranch) return;
        try {
            await activateBranch.mutateAsync({
                branchId: capacityBranch.id,
                employeeCapacity,
            });
            setCapacityOpen(false);
            setCapacityBranch(null);
            toast.success(`${capacityBranch.name} activated`);
        } catch (activateError) {
            if (isBranchLimitReachedError(activateError)) {
                toast.error('Branch limit reached', {
                    description: 'Your plan does not allow more active branches. Upgrade your plan to add this branch.',
                });
            } else if (isCapacityReachedError(activateError)) {
                toast.error('Employee capacity reached', {
                    description: 'The requested capacity exceeds what this plan allows.',
                });
            } else if (isSubscriptionInvalidError(activateError)) {
                toast.error('Subscription issue', {
                    description: 'Your subscription is expired or past due. Please renew it before activating branches.',
                });
            } else {
                toast.error('Unable to activate branch', {
                    description: getApiErrorMessage(activateError, 'Please try again.'),
                });
            }
        }
    };

    const handleIncreaseCapacity = (branch: BranchUsageItem): void => {
        setCapacityBranch(branch);
        setCapacityOpen(true);
    };

    const handleCapacityConfirm = async (employeeCapacity: number): Promise<void> => {
        if (!capacityBranch) return;
        try {
            await updateCapacity.mutateAsync({
                branchId: capacityBranch.id,
                employeeCapacity,
            });
            setCapacityOpen(false);
            setCapacityBranch(null);
            toast.success('Branch capacity updated');
        } catch (capacityError) {
            if (isCapacityReachedError(capacityError)) {
                toast.error('Capacity update failed', {
                    description: 'The requested capacity is below the number of employees currently assigned.',
                });
            } else {
                toast.error('Unable to update capacity', {
                    description: getApiErrorMessage(capacityError, 'Please try again.'),
                });
            }
        }
    };

    const handleDeactivateConfirm = async (): Promise<void> => {
        if (!deactivateTarget) return;
        const name = deactivateTarget.name;
        try {
            await deactivateBranch.mutateAsync({ branchId: deactivateTarget.id });
            setDeactivateTarget(null);
            toast.success(`${name} deactivated`);
        } catch (deactivateError) {
            toast.error('Unable to deactivate branch', {
                description: getApiErrorMessage(deactivateError, 'Please try again.'),
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
                description="Manage your plan, branch availability and employee capacity across your workspace."
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
                    <TabsTrigger value="branches">Branches</TabsTrigger>
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
                            title="Active branches"
                            value={branchLimit === null ? String(activeBranches) : `${activeBranches} / ${branchLimit}`}
                            icon={Building2}
                            tone="success"
                            description={branchLimit === null ? 'Unlimited allowed' : 'active branches'}
                        />
                        <StatCard
                            title="Employee capacity"
                            value={capacityLimit === null ? String(totalEmployees) : `${totalEmployees} / ${capacityLimit}`}
                            icon={Users}
                            tone={capacityLimit !== null && totalEmployees >= capacityLimit ? 'danger' : 'info'}
                            description={capacityLimit === null ? 'Unlimited employees' : 'across active branches'}
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
                                    {formatCapacity(currentPlan.maxBranches)} branches
                                    {' · '}
                                    {formatCapacity(currentPlan.maxEmployees)} employees
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
                                    {data?.entitled
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
                            title="Active branches"
                            value={branchLimit === null ? String(activeBranches) : `${activeBranches} / ${branchLimit}`}
                            icon={Building2}
                            tone="success"
                            description={branchLimit === null ? 'Unlimited allowed' : 'of your plan allowance'}
                        />
                        <StatCard
                            title="Employee usage"
                            value={String(totalEmployees)}
                            icon={Users}
                            tone="info"
                            description="across active branches"
                        />
                        <StatCard
                            title="Employee capacity"
                            value={capacityLimit === null ? 'Unlimited' : String(capacityLimit)}
                            icon={Users}
                            tone={capacityLimit !== null && totalEmployees >= capacityLimit ? 'danger' : 'info'}
                            description={capacityLimit === null ? 'No limit on your plan' : 'allowed by your plan'}
                        />
                        <StatCard
                            title="Remaining capacity"
                            value={capacityLimit === null ? 'Unlimited' : String(Math.max(capacityLimit - totalEmployees, 0))}
                            icon={CheckCircle2}
                            tone={capacityLimit !== null && totalEmployees >= capacityLimit ? 'danger' : 'success'}
                            description="employees you can still assign"
                        />
                    </div>

                    <section className="space-y-4">
                        <div>
                            <h2 className="text-lg font-semibold tracking-tight text-foreground">Usage by branch</h2>
                            <p className="text-sm text-muted-foreground">
                                Employee usage and capacity per branch.
                            </p>
                        </div>

                        {branchUsage.length === 0 ? (
                            <EmptyState
                                icon={Building2}
                                title="No branches yet"
                                description="Create branches to see their usage and capacity here."
                            />
                        ) : (
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                {branchUsage.map((branch) => (
                                    <BranchUsageCard
                                        key={branch.id}
                                        branch={branch}
                                        suggestedMax={planBranchCapacity(currentPlan, branch.employeeCapacity)}
                                        canManage={false}
                                        branchLimitReached={branchLimitReached}
                                        isActivating={false}
                                        onActivate={() => undefined}
                                        onIncreaseCapacity={() => undefined}
                                    />
                                ))}
                            </div>
                        )}
                    </section>
                </TabsContent>

                {/* ------------------------------------------------------------------ */}
                {/* BRANCHES                                                               */}
                {/* ------------------------------------------------------------------ */}
                <TabsContent value="branches" className="space-y-6">
                    <section className="space-y-4">
                        <div>
                            <h2 className="text-lg font-semibold tracking-tight text-foreground">Branches</h2>
                            <p className="text-sm text-muted-foreground">
                                Activate branches, manage employee capacity and deactivate branches you no longer use.
                            </p>
                        </div>

                        {branchUsage.length === 0 ? (
                            <EmptyState
                                icon={Building2}
                                title="No branches yet"
                                description="Create branches to see their subscription and capacity here."
                            />
                        ) : (
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                {branchUsage.map((branch) => (
                                    <div key={branch.id} className="flex flex-col gap-2">
                                        <BranchUsageCard
                                            branch={branch}
                                            suggestedMax={planBranchCapacity(currentPlan, branch.employeeCapacity)}
                                            canManage={canManageBranch}
                                            branchLimitReached={branchLimitReached}
                                            isActivating={activateBranch.isPending && capacityBranch?.id === branch.id}
                                            onActivate={() => handleActivate(branch)}
                                            onIncreaseCapacity={() => handleIncreaseCapacity(branch)}
                                        />
                                        {branch.active && canManageBranch && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={busy}
                                                onClick={() => setDeactivateTarget(branch)}
                                            >
                                                Deactivate
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
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
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight text-foreground">Invoices</h2>
                        <p className="text-sm text-muted-foreground">
                            Your billing history for the current subscription.
                        </p>
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
            <BranchCapacityDialog
                open={capacityOpen}
                branch={capacityBranch}
                currentCapacity={capacityBranch?.employeeCapacity ?? planBranchCapacity(currentPlan, capacityBranch?.employeeCapacity ?? null)}
                suggestedMax={currentPlan?.maxEmployees ?? null}
                isPending={capacityBranch?.active ? updateCapacity.isPending : activateBranch.isPending}
                onOpenChange={(next) => {
                    setCapacityOpen(next);
                    if (!next) setCapacityBranch(null);
                }}
                onConfirm={capacityBranch?.active ? handleCapacityConfirm : handleActivateConfirm}
            />

            <UpgradePlanDialog
                open={planDialogOpen}
                summary={data ?? null}
                targetPlan={targetPlan}
                selectedCycle={selectedCycle}
                isDowngrade={isDowngradeDirection(data ?? null, targetPlan)}
                isPending={upgrade.isPending || downgrade.isPending}
                onOpenChange={(next) => {
                    setPlanDialogOpen(next);
                    if (!next) setTargetPlan(null);
                }}
                onConfirm={handleConfirmPlanChange}
            />

            <CheckoutDialog
                open={checkoutOpen}
                plan={checkoutPlan}
                selectedCycle={checkoutCycle}
                isPending={checkout.isPending}
                onCycleChange={setCheckoutCycle}
                onOpenChange={(next) => {
                    setCheckoutOpen(next);
                    if (!next) setCheckoutPlan(null);
                }}
                onConfirm={handleCheckoutConfirm}
            />

            {/* Deactivate confirmation */}
            <AlertDialog.Root open={deactivateTarget !== null} onOpenChange={(next) => !next && setDeactivateTarget(null)}>
                <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
                    <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-lg focus:outline-none">
                        <AlertDialog.Title className="text-lg font-semibold text-foreground">
                            Deactivate {deactivateTarget?.name}?
                        </AlertDialog.Title>
                        <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                            This branch will no longer be available for scheduling. Employees assigned to it will
                            be removed from the branch.
                        </AlertDialog.Description>
                        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <AlertDialog.Cancel asChild>
                                <Button variant="outline" disabled={deactivateBranch.isPending}>
                                    Cancel
                                </Button>
                            </AlertDialog.Cancel>
                            <AlertDialog.Action asChild>
                                <Button
                                    variant="destructive"
                                    loading={deactivateBranch.isPending}
                                    loadingLabel="Deactivating…"
                                    onClick={handleDeactivateConfirm}
                                >
                                    Deactivate
                                </Button>
                            </AlertDialog.Action>
                        </div>
                    </AlertDialog.Content>
                </AlertDialog.Portal>
            </AlertDialog.Root>

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
