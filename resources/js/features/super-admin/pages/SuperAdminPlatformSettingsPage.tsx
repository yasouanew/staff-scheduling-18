import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ErrorBoundary } from '@/Components/common/ErrorBoundary';
import { PageHeader } from '@/Components/layout/PageHeader';
import { LoadingSkeleton } from '@/Components/common/LoadingSkeleton';
import { getApiErrorMessage } from '@/lib/api-client';
import {
    usePlatformTrialSetting,
    useUpdatePlatformTrialSetting,
} from '@/features/billing/hooks/useBilling';

function TrialSettingCard(): JSX.Element {
    const trialSetting = usePlatformTrialSetting();
    const updateTrialSetting = useUpdatePlatformTrialSetting();
    const [trialPeriodDays, setTrialPeriodDays] = useState('14');

    useEffect(() => {
        if (trialSetting.data) setTrialPeriodDays(String(trialSetting.data.trial_period_days));
    }, [trialSetting.data]);

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
            toast.error('Unable to update trial period', {
                description: getApiErrorMessage(error, 'Try again.'),
            });
        }
    };

    return (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-base font-semibold text-foreground">Default company trial</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Platform-wide default. Applies to every company registered after you save the setting;
                        existing trials are unchanged.
                    </p>
                </div>
                <div className="flex items-end gap-2">
                    <label className="grid gap-1 text-sm font-medium text-foreground">
                        Days
                        <input
                            aria-label="Default trial duration in days"
                            type="number"
                            min="1"
                            max="365"
                            value={trialPeriodDays}
                            onChange={(event) => setTrialPeriodDays(event.target.value)}
                            disabled={trialSetting.isLoading}
                            className="h-10 w-24 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                    </label>
                    <button
                        type="button"
                        disabled={updateTrialSetting.isPending || trialSetting.isLoading}
                        onClick={() => void saveTrialPeriod()}
                        className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    >
                        {updateTrialSetting.isPending ? 'Saving…' : 'Save trial'}
                    </button>
                </div>
            </div>
            {trialSetting.isLoading && <LoadingSkeleton className="mt-4 h-4 w-1/3" radius="sm" />}
        </section>
    );
}

function PlatformSettingsView(): JSX.Element {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Platform Settings"
                eyebrow="Platform"
                description="Platform-wide defaults that apply to all tenants. No customer-facing upgrade or capacity actions live here."
            />
            <TrialSettingCard />
        </div>
    );
}

export default function SuperAdminPlatformSettingsPage(): JSX.Element {
    return (
        <ErrorBoundary
            title="Platform settings unavailable"
            description="An unexpected error interrupted the platform settings. You can retry safely."
        >
            <PlatformSettingsView />
        </ErrorBoundary>
    );
}
