import * as Dialog from '@radix-ui/react-dialog';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/api-client';
import type { BillingPlan, PlanInput } from '@/types/billing';
import { PlanForm } from '../components/PlanForm';
import { PlansTable } from '../components/PlansTable';
import { useBillingPlans, useCreatePlan, useDeletePlan, usePlatformTrialSetting, useUpdatePlan, useUpdatePlatformTrialSetting } from '../hooks/useBilling';

export default function PlansPage(): JSX.Element {
    const plans = useBillingPlans();
    const create = useCreatePlan();
    const update = useUpdatePlan();
    const remove = useDeletePlan();
    const trialSetting = usePlatformTrialSetting();
    const updateTrialSetting = useUpdatePlatformTrialSetting();
    const [trialPeriodDays, setTrialPeriodDays] = useState('14');
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<BillingPlan | undefined>();

    useEffect(() => {
        if (trialSetting.data) setTrialPeriodDays(String(trialSetting.data.trial_period_days));
    }, [trialSetting.data]);

    const submit = async (value: PlanInput): Promise<void> => {
        try {
            if (editing) await update.mutateAsync({ id: editing.id, value });
            else await create.mutateAsync(value);
            toast.success(editing ? 'Plan updated' : 'Plan created');
            setOpen(false);
        } catch (error) {
            toast.error('Unable to save plan', { description: getApiErrorMessage(error, 'Try again.') });
        }
    };

    const saveTrialPeriod = async (): Promise<void> => {
        const days = Number(trialPeriodDays);
        if (!Number.isInteger(days) || days < 1 || days > 365) {
            toast.error('Enter a whole number between 1 and 365 days.');
            return;
        }

        try {
            await updateTrialSetting.mutateAsync(days);
            toast.success('Default trial period updated. New company registrations will use this duration.');
        } catch (error) {
            toast.error('Unable to update trial period', { description: getApiErrorMessage(error, 'Try again.') });
        }
    };

    const deletePlan = (plan: BillingPlan): void => {
        if (!window.confirm(`Delete ${plan.name}? Plans with active subscriptions cannot be removed.`)) return;
        void remove.mutateAsync(plan.id)
            .then(() => toast.success('Plan deleted'))
            .catch((error) => toast.error('Unable to delete plan', { description: getApiErrorMessage(error, 'Try again.') }));
    };

    return <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h1 className="text-2xl font-semibold text-foreground">Plans</h1><p className="mt-1 text-sm text-muted-foreground">Super-admin catalogue management for pricing and Stripe product configuration.</p></div>
            <button type="button" onClick={() => { setEditing(undefined); setOpen(true); }} className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4"/>New plan</button>
        </div>
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div><h2 className="text-base font-semibold text-foreground">Default company trial</h2><p className="mt-1 text-sm text-muted-foreground">This applies to every company registered after you save the setting. Existing trials are unchanged.</p></div>
                <div className="flex items-end gap-2"><label className="grid gap-1 text-sm font-medium text-foreground">Days<input aria-label="Default trial duration in days" type="number" min="1" max="365" value={trialPeriodDays} onChange={(event) => setTrialPeriodDays(event.target.value)} disabled={trialSetting.isLoading} className="h-10 w-24 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label><button type="button" disabled={updateTrialSetting.isPending || trialSetting.isLoading} onClick={() => void saveTrialPeriod()} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{updateTrialSetting.isPending ? 'Saving…' : 'Save trial'}</button></div>
            </div>
        </section>
        {plans.isLoading ? <div className="h-72 animate-pulse rounded-xl bg-muted" /> : plans.isError ? <div className="rounded-xl border border-danger/20 bg-danger/10 p-6 text-danger">Unable to load plans. <button type="button" onClick={() => void plans.refetch()} className="font-semibold underline">Try again</button></div> : <PlansTable plans={plans.data?.data ?? []} onEdit={(plan) => { setEditing(plan); setOpen(true); }} onDelete={deletePlan} />}
        <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40"/><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl"><Dialog.Title className="text-lg font-semibold text-foreground">{editing ? 'Edit plan' : 'Create plan'}</Dialog.Title><div className="mt-4"><PlanForm plan={editing} isSaving={create.isPending || update.isPending} onSubmit={submit} onCancel={() => setOpen(false)} /></div></Dialog.Content></Dialog.Portal></Dialog.Root>
    </div>;
}
