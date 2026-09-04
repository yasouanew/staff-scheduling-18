import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { normalizeWebRole, useWebSession } from '@/features/auth/hooks/useWebSession';
import { WebProductGuide } from '@/features/onboarding/components/WebProductGuide';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import { Header, type HeaderUser } from './Header';
import { MobileNavigation } from './MobileNavigation';
import { Sidebar } from './Sidebar';
import { navigationForRole } from './nav-items';

const DEFAULT_USER: HeaderUser = {
    name: 'Rosterly user',
    email: 'user@rosterly.app',
};

/** Storage key holding the user's manual sidebar collapse preference. */
const SIDEBAR_STORAGE_KEY = 'rosterly.sidebar.collapsed';

/** Read the persisted collapse preference; defaults to expanded. */
function readCollapsedPreference(): boolean {
    try {
        return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}


interface DashboardLayoutProps {
    user?: HeaderUser;
    /** Retained for compatibility; the notification menu reads its own live count. */
    unreadCount?: number;
    onSignOut?: () => void;
}

/**
 * Authenticated application shell.
 * Desktop shows a full sidebar, tablet uses an icon rail, and mobile uses a drawer.
 */
export function DashboardLayout({ user = DEFAULT_USER, onSignOut }: DashboardLayoutProps): JSX.Element {
    const [isDrawerOpen, setDrawerOpen] = useState(false);
    const [isManuallyCollapsed, setManuallyCollapsed] = useState<boolean>(readCollapsedPreference);
    const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');

    const { pathname } = useLocation();
    const session = useWebSession();
    const role = normalizeWebRole(session.data);
    const navItems = navigationForRole(role);
    // The header trial badge should only appear while the company is genuinely
    // on its registration trial. `company_access.trial_is_active` reflects the
    // company's trial window and stays true even after a subscription activates,
    // so once there is an active subscription the badge is suppressed — a paying
    // customer should never see a lingering "trial days left" pill.
    const hasActiveSubscription = session.data?.company_access?.active_subscription_id !== null
        && session.data?.company_access?.active_subscription_id !== undefined;

    const headerUser: HeaderUser = session.data
        ? {
            name: session.data.name,
            email: session.data.email,
            companyId: session.data.company_id ? String(session.data.company_id) : undefined,
            trialEndsAt:
                !hasActiveSubscription && session.data.company_access?.trial_is_active
                    ? session.data.company_access.trial_ends_at
                    : null,
            role: role ?? undefined,
        }
        : user;

    useEffect(() => {
        setDrawerOpen(false);
    }, [pathname]);

    const openDrawer = useCallback(() => setDrawerOpen(true), []);

    // Tablets always use the icon rail; wider screens honour the user's choice.
    const isCollapsed = isTablet || isManuallyCollapsed;

    const toggleCollapse = useCallback(() => {
        setManuallyCollapsed((previous) => {
            const next = !previous;
            try {
                window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
            } catch {
                // Preference persistence is best-effort only.
            }
            return next;
        });
    }, []);

    return <div className="min-h-screen bg-background text-foreground">
        <div className="fixed inset-y-0 left-0 z-40 hidden md:block">
            <Sidebar
                collapsed={isCollapsed}
                items={navItems}
                className="h-screen"
                onToggleCollapse={isTablet ? undefined : toggleCollapse}
            />
        </div>
        <MobileNavigation open={isDrawerOpen} onOpenChange={setDrawerOpen} items={navItems} />
        <div className={cn(
            'flex min-h-screen flex-col transition-[padding] duration-200',
            // Content padding must track the rail/full-width sidebar so the two never overlap.
            isCollapsed ? 'md:pl-[72px]' : 'md:pl-[72px] lg:pl-64',
        )}>

            <Header user={headerUser} onMenuClick={openDrawer} onSignOut={onSignOut} />
            <main className="flex-1 p-4 sm:p-6">
                <Outlet />
            </main>
            <WebProductGuide role={role} />
            <footer className="border-t border-border px-4 py-4 text-xs text-muted-foreground sm:px-6">
                <p>&copy; {new Date().getFullYear()} Rosterly. All rights reserved.</p>
            </footer>
        </div>
    </div>;
}
