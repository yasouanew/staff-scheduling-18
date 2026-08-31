import { LockKeyhole, ReceiptText } from 'lucide-react';
import { Link } from 'react-router-dom';

import { normalizeWebRole, useWebSession } from '@/features/auth/hooks/useWebSession';

export function LockedCompanyPage(): JSX.Element {
    const session = useWebSession();
    const role = normalizeWebRole(session.data);
    const companyId = session.data?.company_id ? String(session.data.company_id) : null;
    const trialEndsAt = session.data?.company_access?.trial_ends_at;
    const trialEndLabel = trialEndsAt
        ? new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(trialEndsAt))
        : null;

    return <section className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-xl items-center py-8">
        <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <LockKeyhole className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">Your workspace is awaiting activation</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Your trial period has ended{trialEndLabel ? ` on ${trialEndLabel}` : ''}. Activate a subscription to restore access to your rosters, employees, leave, and scheduling tools.
            </p>
            {role === 'company_admin' ? <Link to="/subscription" className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ReceiptText className="h-4 w-4" aria-hidden="true" />Choose a subscription</Link> : <p className="mt-6 rounded-lg border border-border bg-secondary px-4 py-3 text-sm text-secondary-foreground">Please contact your company administrator to activate this workspace.</p>}
            <p className="mt-5 text-xs leading-5 text-muted-foreground">After Stripe confirms payment, Rosterly automatically unlocks the workspace and sends a confirmation by email and in-app notification.</p>
        </div>
    </section>;
}
