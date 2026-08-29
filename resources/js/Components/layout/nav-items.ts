import {
    BarChart3,
    BriefcaseBusiness,
    Building,
    Building2,
    CalendarClock,
    CalendarDays,
    CalendarX,
    Clock,
    CreditCard,
    LayoutDashboard,
    Network,
    Settings,
    ShieldCheck,
    Users,
    type LucideIcon,
} from 'lucide-react';
import type { WebRole } from '@/features/auth/hooks/useWebSession';

export interface NavItem {
    label: string;
    to: string;
    icon: LucideIcon;
    end?: boolean;
    roles: readonly Exclude<WebRole, 'employee'>[];
}

const ALL_WEB_ROLES = ['super_admin', 'company_admin', 'scheduler'] as const;
const COMPANY_ROLES = ['company_admin', 'scheduler'] as const;
const COMPANY_ADMIN_ONLY = ['company_admin'] as const;

export const NAV_ITEMS: readonly NavItem[] = [
    { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, end: true, roles: ALL_WEB_ROLES },
    { label: 'Platform', to: '/super-admin', icon: ShieldCheck, roles: ['super_admin'] },
    { label: 'Companies', to: '/super-admin/companies', icon: Building, roles: ['super_admin'] },
    { label: 'Plans', to: '/plans', icon: CreditCard, roles: ['super_admin'] },
    { label: 'Team', to: '/employees', icon: Users, roles: COMPANY_ADMIN_ONLY },
    { label: 'Subscription', to: '/subscription', icon: CreditCard, roles: COMPANY_ADMIN_ONLY },
    { label: 'Branches', to: '/branches', icon: Building2, roles: COMPANY_ADMIN_ONLY },
    { label: 'Departments', to: '/departments', icon: Network, roles: COMPANY_ADMIN_ONLY },
    { label: 'Positions', to: '/positions', icon: BriefcaseBusiness, roles: COMPANY_ADMIN_ONLY },
    { label: 'Rosters', to: '/rosters', icon: CalendarDays, roles: COMPANY_ROLES },
    { label: 'Shifts', to: '/shifts', icon: Clock, roles: COMPANY_ROLES },
    { label: 'Leave Requests', to: '/leave-requests', icon: CalendarX, roles: COMPANY_ROLES },
    { label: 'Availability', to: '/availability', icon: CalendarClock, roles: COMPANY_ADMIN_ONLY },
    { label: 'Leave Types', to: '/leave-types', icon: CalendarDays, roles: COMPANY_ADMIN_ONLY },
    { label: 'Reports', to: '/dashboard', icon: BarChart3, roles: COMPANY_ROLES },
    { label: 'Settings', to: '/settings', icon: Settings, roles: COMPANY_ADMIN_ONLY },
] as const;

export function navigationForRole(role: WebRole | null): readonly NavItem[] {
    if (!role || role === 'employee') return [];
    return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
