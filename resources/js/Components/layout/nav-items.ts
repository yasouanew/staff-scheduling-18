import {
    Bell,
    BriefcaseBusiness,
    Building,
    Building2,
    CalendarDays,
    CalendarRange,
    CalendarX,
    Clock,
    CreditCard,
    LayoutDashboard,
    Network,
    ScrollText,
    Settings,
    ShieldCheck,
    Users,
    Wallet,
    type LucideIcon,
} from 'lucide-react';
import type { WebRole } from '@/features/auth/hooks/useWebSession';

export interface NavItem {
    label: string;
    to: string;
    icon: LucideIcon;
    end?: boolean;
    /** Optional group label rendered above the first item that declares it. */
    section?: string;
    roles: readonly Exclude<WebRole, 'employee'>[];
}

const ALL_WEB_ROLES = ['super_admin', 'company_admin', 'scheduler'] as const;
const COMPANY_ROLES = ['company_admin', 'scheduler'] as const;
const COMPANY_ADMIN_ONLY = ['company_admin'] as const;

export const NAV_ITEMS: readonly NavItem[] = [
    { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, end: true, roles: ALL_WEB_ROLES },

    { label: 'Platform', to: '/super-admin', icon: ShieldCheck, section: 'Platform', roles: ['super_admin'] },
    { label: 'Companies', to: '/super-admin/companies', icon: Building, section: 'Platform', roles: ['super_admin'] },
    { label: 'Plans', to: '/super-admin/plans', icon: CreditCard, section: 'Platform', roles: ['super_admin'] },
    { label: 'Subscriptions', to: '/super-admin/subscriptions', icon: CreditCard, section: 'Platform', roles: ['super_admin'] },
    { label: 'Payments', to: '/super-admin/payments', icon: Wallet, section: 'Platform', roles: ['super_admin'] },
    { label: 'Audit', to: '/super-admin/audit', icon: ScrollText, section: 'Platform', roles: ['super_admin'] },
    { label: 'Platform Settings', to: '/super-admin/settings', icon: Settings, section: 'Platform', roles: ['super_admin'] },

    { label: 'Branches', to: '/branches', icon: Building2, section: 'Workspace', roles: COMPANY_ADMIN_ONLY },
    { label: 'Departments', to: '/departments', icon: Network, section: 'Workspace', roles: COMPANY_ADMIN_ONLY },
    { label: 'Positions', to: '/positions', icon: BriefcaseBusiness, section: 'Workspace', roles: COMPANY_ADMIN_ONLY },

    { label: 'Rosters', to: '/rosters', icon: CalendarDays, section: 'Scheduling', roles: COMPANY_ROLES },
    { label: 'Shifts', to: '/shifts', icon: Clock, section: 'Scheduling', roles: COMPANY_ROLES },
    { label: 'Shift Templates', to: '/shift-templates', icon: CalendarRange, section: 'Scheduling', roles: COMPANY_ROLES },
    { label: 'Employees', to: '/employees', icon: Users, section: 'Scheduling', roles: COMPANY_ROLES },
    { label: 'Leave Requests', to: '/leave-requests', icon: CalendarX, section: 'Scheduling', roles: COMPANY_ROLES },
    { label: 'Leave Types', to: '/leave-types', icon: CalendarDays, section: 'Scheduling', roles: COMPANY_ADMIN_ONLY },

    { label: 'Notifications', to: '/notifications', icon: Bell, roles: ALL_WEB_ROLES },
    { label: 'Subscription & Billing', to: '/subscription', icon: CreditCard, roles: COMPANY_ADMIN_ONLY },
    { label: 'Settings', to: '/settings', icon: Settings, roles: COMPANY_ADMIN_ONLY },
] as const;

export function navigationForRole(role: WebRole | null): readonly NavItem[] {
    if (!role || role === 'employee') return [];
    return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
