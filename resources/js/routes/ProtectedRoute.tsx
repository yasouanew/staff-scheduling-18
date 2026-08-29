import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { normalizeWebRole, useWebSession } from '@/features/auth/hooks/useWebSession';

/** Protects browser-only routes using an authoritative session role check. */
export function ProtectedRoute(): JSX.Element {
    const { isAuthenticated, clearToken } = useAuth();
    const location = useLocation();
    const session = useWebSession(isAuthenticated);
    const role = normalizeWebRole(session.data);

    useEffect(() => {
        if (role === 'employee' || session.isError) clearToken();
    }, [clearToken, role, session.isError]);

    if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;

    if (session.isLoading) {
        return <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Loading workspace…</div>;
    }

    if (role === 'employee') {
        return <Navigate to="/login?reason=mobile-only" replace state={{ from: location }} />;
    }

    if (session.isError || !role) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }

    const isSubscriptionActivationRoute = /^\/companies\/[^/]+\/subscriptions$/.test(location.pathname);

    if (session.data?.company_access?.is_locked && location.pathname !== '/account-locked' && !isSubscriptionActivationRoute) {
        return <Navigate to="/account-locked" replace state={{ from: location }} />;
    }

    return <Outlet />;
}
