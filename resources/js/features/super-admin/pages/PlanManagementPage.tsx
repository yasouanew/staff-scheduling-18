import { zodResolver } from '@hookform/resolvers/zod';
import * as Dialog from '@radix-ui/react-dialog';
import * as Switch from '@radix-ui/react-switch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertTriangle, Check, Loader2, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { EmptyState } from '@/Components/common/EmptyState';
import { ErrorBoundary } from '@/Components/common/ErrorBoundary';
import { LoadingSkeleton } from '@/Components/common/LoadingSkeleton';
import { formatAud } from '@/lib/chart';
import { cn } from '@/lib/utils';
import type { PlanTier, SubscriptionPlan } from '@/types/super-admin';

import {
    useCreatePlan,
    useSubscriptionPlans,
    useTogglePlanFeature,
    useUpdatePlanPricing,
} from '../hooks/useSuperAdmin';

/** Dedicated client so the plan catalogue works standalone. */
const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

/** Accent classes applied to each tier's header badge. */
const TIER_BADGE: Record<PlanTier, string> = {
    free: 'bg-info/10 text-info',
    growth: 'bg-primary/10 text-primary',
    enterprise: 'bg-success/10 text-success',
};

/** Shared input styling for editable pricing fields. */
const priceInputClasses = cn(
    'h-10 w-full rounded-lg border border-input bg-background pl-7 pr-3 text-sm text-foreground',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

/* -------------------------------------------------------------------------- */
/* Add-plan form                                                              */
/* -------------------------------------------------------------------------- */

const createPlanSchema = z.object({
    name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
    tier: z.enum(['free', 'growth', 'enterprise']),
    description: z.string().min(4, { message: 'Add a short description.' }),
    monthlyPrice: z.number({ message: 'Enter a valid amount.' }).min(0, {
        message: 'Price cannot be negative.',
    }),
    annualPrice: z.number({ message: 'Enter a valid amount.' }).min(0, {
        message: 'Price cannot be negative.',
    }),
    seatLimit: z
        .number({ message: 'Enter a seat limit.' })
        .int({ message: 'Seats must be a whole number.' })
        .min(1, { message: 'At least one seat is required.' }),
});

type CreatePlanFormValues = z.infer<typeof createPlanSchema>;

/** Field-level error text shown beneath an input. */
function FieldError({ message }: { message?: string }): JSX.Element | null {
    if (!message) {
        return null;
    }
    return <p className="mt-1 text-xs text-danger">{message}</p>;
}

/** Modal form to add a new plan tier to the catalogue. */
function AddPlanDialog(): JSX.Element {
    const [open, setOpen] = useState(false);
    const createPlan = useCreatePlan();

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<CreatePlanFormValues>({
        resolver: zodResolver(createPlanSchema),
        defaultValues: {
            name: '',
            tier: 'growth',
            description: '',
            monthlyPrice: 0,
            annualPrice: 0,
            seatLimit: 50,
        },
    });

    const onSubmit = handleSubmit((values) => {
        createPlan.mutate(
            {
                name: values.name,
                tier: values.tier,
                description: values.description,
                monthlyPrice: values.monthlyPrice,
                annualPrice: values.annualPrice,
                seatLimit: values.seatLimit,
            },
            {
                onSuccess: (plan) => {
                    toast.success(`${plan.name} plan created.`);
                    reset();
                    setOpen(false);
                },
                onError: () => toast.error('Unable to create plan.'),
            },
        );
    });

    const handleOpenChange = (next: boolean): void => {
        if (!next) {
            reset();
        }
        setOpen(next);
    };

    return (
        <Dialog.Root open={open} onOpenChange={handleOpenChange}>
            <Dialog.Trigger asChild>
                <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add plan
                </button>
            </Dialog.Trigger>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                    <div className="mb-4 flex items-start justify-between">
                        <div>
                            <Dialog.Title className="text-lg font-semibold text-foreground">
                                Add a new plan
                            </Dialog.Title>
                            <Dialog.Description className="text-sm text-muted-foreground">
                                Publish a new subscription tier for tenants to adopt.
                            </Dialog.Description>
                        </div>
                        <Dialog.Close asChild>
                            <button
                                type="button"
                                aria-label="Close"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </Dialog.Close>
                    </div>

                    <form onSubmit={onSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="plan-name" className="mb-1 block text-sm font-medium text-foreground">
                                Plan name
                            </label>
                            <input
                                id="plan-name"
                                type="text"
                                {...register('name')}
                                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                            <FieldError message={errors.name?.message} />
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label htmlFor="plan-tier" className="mb-1 block text-sm font-medium text-foreground">
                                    Tier
                                </label>
                                <select
                                    id="plan-tier"
                                    {...register('tier')}
                                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <option value="free">Free</option>
                                    <option value="growth">Growth</option>
                                    <option value="enterprise">Enterprise</option>
                                </select>
                                <FieldError message={errors.tier?.message} />
                            </div>
                            <div>
                                <label htmlFor="plan-seats" className="mb-1 block text-sm font-medium text-foreground">
                                    Seat limit
                                </label>
                                <input
                                    id="plan-seats"
                                    type="number"
                                    min={1}
                                    {...register('seatLimit', { valueAsNumber: true })}
                                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                                <FieldError message={errors.seatLimit?.message} />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label htmlFor="plan-monthly" className="mb-1 block text-sm font-medium text-foreground">
                                    Monthly price (AUD)
                                </label>
                                <div className="relative">
                                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                        $
                                    </span>
                                    <input
                                        id="plan-monthly"
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        {...register('monthlyPrice', { valueAsNumber: true })}
                                        className={priceInputClasses}
                                    />
                                </div>
                                <FieldError message={errors.monthlyPrice?.message} />
                            </div>
                            <div>
                                <label htmlFor="plan-annual" className="mb-1 block text-sm font-medium text-foreground">
                                    Annual price (AUD)
                                </label>
                                <div className="relative">
                                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                        $
                                    </span>
                                    <input
                                        id="plan-annual"
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        {...register('annualPrice', { valueAsNumber: true })}
                                        className={priceInputClasses}
                                    />
                                </div>
                                <FieldError message={errors.annualPrice?.message} />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="plan-desc" className="mb-1 block text-sm font-medium text-foreground">
                                Description
                            </label>
                            <textarea
                                id="plan-desc"
                                rows={2}
                                {...register('description')}
                                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                            <FieldError message={errors.description?.message} />
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <Dialog.Close asChild>
                                <button
                                    type="button"
                                    className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    Cancel
                                </button>
                            </Dialog.Close>
                            <button
                                type="submit"
                                disabled={createPlan.isPending}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
                            >
                                {createPlan.isPending && (
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                )}
                                Create plan
                            </button>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

/* -------------------------------------------------------------------------- */
/* Plan card                                                                  */
/* -------------------------------------------------------------------------- */

/** Editable plan tier card: pricing controls + feature restriction toggles. */
function PlanCard({ plan }: { plan: SubscriptionPlan }): JSX.Element {
    const updatePricing = useUpdatePlanPricing();
    const toggleFeature = useTogglePlanFeature();
    const [monthly, setMonthly] = useState(String(plan.monthlyPrice));
    const [annual, setAnnual] = useState(String(plan.annualPrice));

    const isDirty =
        Number(monthly) !== plan.monthlyPrice || Number(annual) !== plan.annualPrice;

    const handleSavePricing = (): void => {
        updatePricing.mutate(
            { planId: plan.id, monthlyPrice: Number(monthly), annualPrice: Number(annual) },
            {
                onSuccess: () => toast.success(`${plan.name} pricing updated.`),
                onError: () => toast.error('Unable to update pricing.'),
            },
        );
    };

    const handleToggleFeature = (featureId: string, included: boolean): void => {
        toggleFeature.mutate(
            { planId: plan.id, featureId, included },
            { onError: () => toast.error('Unable to update feature.') },
        );
    };

    return (
        <article className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
            <header className="mb-4 flex items-center justify-between">
                <div>
                    <h2 className="text-base font-semibold tracking-tight text-foreground">
                        {plan.name}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        {plan.seatLimit === null
                            ? 'Unlimited seats'
                            : `Up to ${plan.seatLimit.toLocaleString('en-AU')} seats`}
                    </p>
                </div>
                <span
                    className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize',
                        TIER_BADGE[plan.tier],
                    )}
                >
                    {plan.isPublished ? plan.tier : 'Draft'}
                </span>
            </header>

            <p className="mb-4 text-sm text-muted-foreground">{plan.description}</p>

            {/* Pricing controls */}
            <div className="mb-4 grid grid-cols-2 gap-3">
                <div>
                    <label
                        htmlFor={`${plan.id}-monthly`}
                        className="mb-1 block text-xs font-medium text-muted-foreground"
                    >
                        Monthly
                    </label>
                    <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            $
                        </span>
                        <input
                            id={`${plan.id}-monthly`}
                            type="number"
                            min={0}
                            step="0.01"
                            value={monthly}
                            onChange={(event) => setMonthly(event.target.value)}
                            className={priceInputClasses}
                        />
                    </div>
                </div>
                <div>
                    <label
                        htmlFor={`${plan.id}-annual`}
                        className="mb-1 block text-xs font-medium text-muted-foreground"
                    >
                        Annual
                    </label>
                    <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            $
                        </span>
                        <input
                            id={`${plan.id}-annual`}
                            type="number"
                            min={0}
                            step="0.01"
                            value={annual}
                            onChange={(event) => setAnnual(event.target.value)}
                            className={priceInputClasses}
                        />
                    </div>
                </div>
            </div>

            <div className="mb-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                    Current: <span className="font-medium text-foreground">{formatAud(plan.monthlyPrice)}</span>/mo
                </p>
                <button
                    type="button"
                    onClick={handleSavePricing}
                    disabled={!isDirty || updatePricing.isPending}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                    {updatePricing.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                        <Check className="h-4 w-4" aria-hidden="true" />
                    )}
                    Save
                </button>
            </div>

            {/* Feature restriction toggles */}
            <div className="mt-auto space-y-2 border-t border-border pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Features
                </p>
                <ul className="space-y-2.5">
                    {plan.features.map((feature) => (
                        <li key={feature.id} className="flex items-center justify-between gap-3">
                            <label
                                htmlFor={`${plan.id}-${feature.id}`}
                                className={cn(
                                    'text-sm',
                                    feature.included ? 'text-foreground' : 'text-muted-foreground',
                                )}
                            >
                                {feature.label}
                            </label>
                            <Switch.Root
                                id={`${plan.id}-${feature.id}`}
                                checked={feature.included}
                                onCheckedChange={(checked) =>
                                    handleToggleFeature(feature.id, checked)
                                }
                                disabled={toggleFeature.isPending}
                                className={cn(
                                    'relative h-5 w-9 shrink-0 rounded-full border border-transparent transition-colors',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                                    'data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted',
                                )}
                            >
                                <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[18px]" />
                            </Switch.Root>
                        </li>
                    ))}
                </ul>
            </div>
        </article>
    );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

/** Inner catalogue view (relies on an ancestor QueryClientProvider). */
function PlanCatalogue(): JSX.Element {
    const { data, isLoading, isError, refetch } = useSubscriptionPlans();
    const plans = data ?? [];

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        Plan Management
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Configure subscription tiers, adjust AUD pricing and restrict features.
                    </p>
                </div>
                <AddPlanDialog />
            </div>

            {isError ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Unable to load plans</p>
                        <p className="text-sm text-muted-foreground">
                            The plan catalogue failed to load. Please try again.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void refetch()}
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Try again
                    </button>
                </div>
            ) : isLoading ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <LoadingSkeleton key={index} className="h-96 w-full" radius="lg" />
                    ))}
                </div>
            ) : plans.length === 0 ? (
                <EmptyState
                    title="No plans yet"
                    description="Create your first subscription plan to start onboarding tenants."
                />
            ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {plans.map((plan) => (
                        <PlanCard key={plan.id} plan={plan} />
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Super Admin plan catalogue. Owns the feature-scoped QueryClient, guards the
 * view with an error boundary, and lets platform operators add plans, change
 * AUD pricing and restrict features per tier.
 */
export default function PlanManagementPage(): JSX.Element {
    return (
        <QueryClientProvider client={queryClient}>
            <ErrorBoundary
                title="Plan management unavailable"
                description="An unexpected error interrupted the plan catalogue. You can retry safely."
            >
                <PlanCatalogue />
            </ErrorBoundary>
        </QueryClientProvider>
    );
}
