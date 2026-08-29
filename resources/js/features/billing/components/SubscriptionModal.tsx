import * as Dialog from '@radix-ui/react-dialog';
import { CreditCard } from 'lucide-react';
import { useState } from 'react';
import type { BillingPlan } from '@/types/billing';
type BillingCycle = 'monthly' | 'six_month' | 'yearly';

export function SubscriptionModal({
    plans,
    isPending,
    onCheckout,
}: {
    plans: BillingPlan[];
    isPending?: boolean;
    onCheckout: (planId: string, cycle: BillingCycle) => Promise<void>;
}): JSX.Element {
    const [open, setOpen] = useState(false);
    const [planId, setPlanId] = useState('');
    const [cycle, setCycle] = useState<BillingCycle>('monthly');
    const selectedPlan = plans.find((plan) => plan.id === planId);
    const selectedTermAvailable = cycle === 'monthly'
        ? Boolean(selectedPlan?.stripeMonthlyPriceId)
        : cycle === 'six_month'
            ? Boolean(selectedPlan?.stripeSixMonthlyPriceId) && selectedPlan?.priceSixMonthly !== null
            : Boolean(selectedPlan?.stripeYearlyPriceId);

    return <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
            <button className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
                <CreditCard className="h-4 w-4" />Start subscription
            </button>
        </Dialog.Trigger>
        <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl">
                <Dialog.Title className="text-lg font-semibold text-foreground">Choose a plan</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-muted-foreground">You will continue to Stripe’s hosted checkout to enter payment details securely.</Dialog.Description>
                <div className="mt-5 space-y-4">
                    <label className="block text-sm font-medium text-foreground">Plan
                        <select required value={planId} onChange={(event) => setPlanId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground">
                            <option value="">Select a plan…</option>
                            {plans.filter((plan) => plan.isActive).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                        </select>
                    </label>
                    <fieldset>
                        <legend className="text-sm font-medium text-foreground">Subscription duration</legend>
                        <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-foreground sm:grid-cols-3">
                            <label className="flex items-center gap-2 rounded-lg border border-border p-3"><input type="radio" checked={cycle === 'monthly'} onChange={() => setCycle('monthly')} />Monthly</label>
                            <label className="flex items-center gap-2 rounded-lg border border-border p-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"><input type="radio" checked={cycle === 'six_month'} disabled={selectedPlan ? (!selectedPlan.stripeSixMonthlyPriceId || selectedPlan.priceSixMonthly === null) : false} onChange={() => setCycle('six_month')} />6 months</label>
                            <label className="flex items-center gap-2 rounded-lg border border-border p-3"><input type="radio" checked={cycle === 'yearly'} onChange={() => setCycle('yearly')} />Yearly</label>
                        </div>
                        {selectedPlan && !selectedTermAvailable ? <p className="mt-2 text-sm text-destructive">This duration is not configured for the selected plan. Choose another duration or contact your administrator.</p> : null}
                    </fieldset>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                    <Dialog.Close asChild><button className="h-10 rounded-lg border border-input px-4 text-sm font-medium text-foreground">Cancel</button></Dialog.Close>
                    <button disabled={!planId || !selectedTermAvailable || isPending} onClick={() => void onCheckout(planId, cycle)} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{isPending ? 'Opening Stripe…' : 'Continue to Stripe'}</button>
                </div>
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>;
}
