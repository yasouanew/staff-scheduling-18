import { Navigate } from 'react-router-dom';

import { useWebSession } from '@/features/auth/hooks/useWebSession';

import { CompanySettingsPage } from './CompanySettingsPage';

/**
 * Top-level `/settings` route for Company Admins.
 *
 * Unlike `/companies/:id/settings` (which carries the company id in the URL),
 * the `/settings` route has no id parameter. The authenticated admin's *own*
 * company id is resolved from the web session (`GET /auth/me` → `company_id`)
 * and passed to the real {@link CompanySettingsPage}.
 *
 * This is intentionally the only way a Company Admin reaches their own
 * settings: the id always comes from the session, never from user input, so a
 * Company Admin can never open another company's settings here (the backend
 * `companies/{company}/settings` endpoint additionally enforces
 * `CompanyPolicy::belongsToCompany` as a second line of defence).
 */
export function CompanySettingsRoute(): JSX.Element {
    const session = useWebSession();

    if (session.isLoading) {
        return <div className="p-8 text-sm text-muted-foreground">Loading settings…</div>;
    }

    const companyId = session.data?.company_id ? String(session.data.company_id) : null;

    // A company admin without a company is not expected; fall back to a safe
    // target rather than rendering an empty settings form.
    if (!companyId) {
        return <Navigate to="/dashboard" replace />;
    }

    return <CompanySettingsPage companyId={companyId} />;
}

export default CompanySettingsRoute;
