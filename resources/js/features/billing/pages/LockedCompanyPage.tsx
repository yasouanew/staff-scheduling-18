import { LockKeyhole, ReceiptText } from 'lucide-react';
import { Link } from 'react-router-dom';

import { normalizeWebRole, useWebSession } from '@/features/auth/hooks/useWebSession';

export function LockedCompanyPage(): JSX.Element {
    const session = useWebSession();
    const role = normalizeWebRole(session.data);
    const companyId = session.data?.company_id ? String(session.data.company_id) : null;
    const access = session.data?.company_access;
    // The gate fires for both an expired trial and a lapsed subscription
    // (cancelled / past-due / expired). Read the session state so the copy
    // matches which one actually locked the company.
    const trialEndsAt = access?.trial_ends_at ?? null;
    const isTrialLocked = Boolean(access?.trial_is_active) || trialEndsAt !== null;
    const subscriptionEndsAt = access?.active_subscription_ends_at ?? null;
    const subscriptionEndLabel = subscriptionEndsAt
        ? new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(subscriptionEndsAt))
        : null;
    const trialEndLabel = trialEndsAt
        ? new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(trialEndsAt))
        : null;
    const headline = isTrialLocked
        ? 'Your trial has ended'
        : 'Your subscription needs attention';
    const description = isTrialLocked
        ? `Your trial period has ended${trialEndLabel ? ` on ${trialEndLabel}` : ''}. Choose a plan to keep using rosters, employees, leave, and scheduling tools.`
        : subscriptionEndsAt
            ? `Your subscription ${subscriptionEndLabel ? `ended on ${subscriptionEndLabel}` : 'has ended'}. Reactivate a plan to restore access to rosters, employees, leave, and scheduling tools.`
            : 'Your subscription is no longer active. Reactivate a plan to restore access to rosters, employees, leave, and scheduling tools.';

    return <section className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-xl items-center py-8">
        <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <LockKeyhole className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">{headline}</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
            {role === 'company_admin' ? <Link to="/subscription" className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ReceiptText className="h-4 w-4" aria-hidden="true" />Choose a subscription</Link> : <p className="mt-6 rounded-lg border border-border bg-secondary px-4 py-3 text-sm text-secondary-foreground">Please contact your company administrator to activate this workspace.</p>}
            <p className="mt-5 text-xs leading-5 text-muted-foreground">After Stripe confirms payment, Rosterly automatically unlocks the workspace and sends a confirmation by email and in-app notification.</p>
        </div>
    </section>;
}
