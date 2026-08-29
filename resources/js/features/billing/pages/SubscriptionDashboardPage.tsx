import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeftRight, Building2, CreditCard, RefreshCcw, Users } from 'lucide-react';

import * as AlertDialog from '@radix-ui/react-alert-dialog';

import { Button } from '@/Components/ui/button';
import { Badge } from '@/Components/ui/badge';
import { ErrorAlert } from '@/Components/common/ErrorAlert';
import { EmptyState } from '@/Components/common/EmptyState';
import { LoadingSkeleton } from '@/Components/common/LoadingSkeleton';
import { PageHeader } from '@/Components/common/PageHeader';
import { StatCard } from '@/Components/common/StatCard';
import { getApiErrorMessage } from '@/lib/api-client';

import { useWebSession } from '@/features/auth/hooks/useWebSession';

import type { BranchUsageItem, ManagementPlan, SubscriptionSummary } from '../types';
import { formatCapacity } from '../lib/format';
import { canManageBilling, canManageBranchBilling, canViewBilling } from '../lib/permissions';
import {
    getBillingErrorCode,
    isBranchLimitReachedError,
    isCapacityReachedError,
    isSubscriptionInvalidError,
} from '../lib/billing-errors';
import {
    useManagementPlans,
    useSubscriptionSummary,
    useUpgradeSubscription,
    useDowngradeSubscription,
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

/** Branch capacity a plan allows per branch (hint only; backend is authoritative). */
function planBranchCapacity(plan: { maxEmployees: number | null } | null, current: number | null): number | null {
    if (current !== null) return current;
    return plan?.maxEmployees ?? null;
}

/** Human-friendly subscription status label + badge tone. */
function subscriptionStatusLabel(status: string | undefined): string {
    if (!status) return 'No active plan';
    return status
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Company management Subscription & Branch Billing dashboard.
 *
 * Shows the current plan, subscription state, active branch / employee usage and
 * a per-branch capacity breakdown, plus a plan comparison and upgrade flow.
 *
 * Visibility and actions are permission-gated (billing view / manage and branch
 * capacity). Pricing and limits are always sourced from the backend; this page
 * never computes billing amounts.
 */
export default function SubscriptionDashboardPage(): JSX.Element {
    const webSession = useWebSession();
    const user = webSession.data;

    const canView = canViewBilling(user);
    const canManage = canManageBilling(user);
    const canManageBranch = canManageBranchBilling(user);

    const summary = useSubscriptionSummary();
    const plansQuery = useManagementPlans();

    const activateBranch = useActivateBranch();
    const deactivateBranch = useDeactivateBranch();
    const updateCapacity = useUpdateBranchCapacity();
    const upgrade = useUpgradeSubscription();
    const downgrade = useDowngradeSubscription();

    /* ------------------------------------------------------------------ */
    /* Local UI state                                                       */
    /* ------------------------------------------------------------------ */
    const [selectedCycle, setSelectedCycle] = useState('monthly');
    const [planDialogOpen, setPlanDialogOpen] = useState(false);
    const [targetPlan, setTargetPlan] = useState<ManagementPlan | null>(null);

    const [capacityBranch, setCapacityBranch] = useState<BranchUsageItem | null>(null);
    const [capacityOpen, setCapacityOpen] = useState(false);

    const [deactivateTarget, setDeactivateTarget] = useState<BranchUsageItem | null>(null);

    const [error, setError] = useState<string | null>(null);

    /* ------------------------------------------------------------------ */
    /* Derived data                                                         */
    /* ------------------------------------------------------------------ */
    const plans = plansQuery.data ?? [];
    const data = summary.data;

    const currentPlan = data?.plan ?? null;
    const branchUsage = data?.usage?.branchUsage ?? [];
    const activeBranches = data?.usage?.branches?.used ?? 0;
    const branchLimit = data?.usage?.branches?.limit ?? null;
    const branchLimitReached = branchLimit !== null && activeBranches >= branchLimit;

    const totalEmployees = branchUsage.reduce((sum, branch) => sum + branch.employeesUsed, 0);
    const capacityLimit = currentPlan?.maxEmployees ?? null;

    const busy = activateBranch.isPending || deactivateBranch.isPending || updateCapacity.isPending;

    /* ------------------------------------------------------------------ */
    /* Handlers                                                             */
    /* ------------------------------------------------------------------ */

    const handleSelectPlan = (plan: ManagementPlan): void => {
        setTargetPlan(plan);
        setPlanDialogOpen(true);
    };

    const handleConfirmPlanChange = async (plan: ManagementPlan): Promise<void> => {
        const isDown = isDowngradeDirection(data ?? null, plan);
        const mutation = isDown ? downgrade : upgrade;
        try {
            await mutation.mutateAsync({ planId: plan.id, billingCycle: selectedCycle as 'monthly' | 'six_month' | 'yearly' });
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
        const code = getBillingErrorCode(summary.error);
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
                actions={
                    canManageBranch && data?.usage?.branches?.used
                        ? <Button variant="outline" onClick={() => setError(null)}>Refresh</Button>
                        : undefined
                }
            />

            {error && (
                <ErrorAlert
                    variant="warning"
                    title="Something needs attention"
                    message={error}
                    onDismiss={() => setError(null)}
                />
            )}

            {/* Summary stats */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    title="Current plan"
                    value={data?.plan?.name ?? 'No active plan'}
                    icon={CreditCard}
                    tone="primary"
                    description={subscriptionStatusLabel(data?.subscription?.status)}
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
                <StatCard
                    title="Next renewal"
                    value={data?.subscription?.renewsAt ?? data?.subscription?.trialEndsAt ?? '—'}
                    icon={RefreshCcw}
                    tone="warning"
                    description={data?.trial?.active ? 'trial period' : 'billing cycle'}
                />
            </div>

            {/* Plan comparison */}
            {plans.length > 0 && (
                <section className="space-y-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold tracking-tight text-foreground">Plans</h2>
                            <p className="text-sm text-muted-foreground">
                                Compare plans and switch when your needs change.
                            </p>
                        </div>
                        {!canManage && (
                            <p className="text-xs text-muted-foreground">
                                Contact your administrator to change plans.
                            </p>
                        )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {plans.map((plan) => (
                            <PlanCard
                                key={plan.id}
                                plan={plan}
                                isCurrent={currentPlan?.id === plan.id}
                                canManage={canManage}
                                selectedCycle={selectedCycle}
                                onCycleChange={setSelectedCycle}
                                onSelect={handleSelectPlan}
                            />
                        ))}
                    </div>
                </section>
            )}

            {/* Branch usage */}
            <section className="space-y-4">
                <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">Branches</h2>
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
                            <BranchUsageCard
                                key={branch.id}
                                branch={branch}
                                suggestedMax={planBranchCapacity(currentPlan, branch.employeeCapacity)}
                                canManage={canManageBranch}
                                branchLimitReached={branchLimitReached}
                                isActivating={activateBranch.isPending && capacityBranch?.id === branch.id}
                                onActivate={() => handleActivate(branch)}
                                onIncreaseCapacity={() => handleIncreaseCapacity(branch)}
                            />
                        ))}
                    </div>
                )}
            </section>

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
        </div>
    );
}
