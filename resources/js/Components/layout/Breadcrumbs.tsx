import { Fragment, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/Components/ui/breadcrumb';

interface BreadcrumbSegment {
    label: string;
    to: string;
    isCurrent: boolean;
}

const ROUTE_LABELS: Record<string, string> = {
    'account-locked': 'Account locked',
    availability: 'Availability',
    branches: 'Branches',
    companies: 'Companies',
    dashboard: 'Dashboard',
    departments: 'Departments',
    employees: 'Employees',
    'leave-requests': 'Leave requests',
    'leave-types': 'Leave types',
    new: 'New request',
    notifications: 'Notifications',
    payments: 'Payments',
    positions: 'Positions',
    rosters: 'Rosters',
    settings: 'Settings',
    shifts: 'Shifts',
    subscriptions: 'Subscriptions',
    'super-admin': 'Platform',
};

function labelForSegment(segment: string): string {
    if (ROUTE_LABELS[segment]) {
        return ROUTE_LABELS[segment];
    }

    if (/^\d+$/.test(segment) || /^[a-f\d-]{16,}$/i.test(segment)) {
        return 'Details';
    }

    return segment.split('-').filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export function Breadcrumbs(): JSX.Element {
    const { pathname } = useLocation();
    const segments = useMemo<BreadcrumbSegment[]>(() => {
        const pathSegments = pathname.split('/').filter(Boolean);

        if (pathSegments.length === 0) {
            return [{ label: 'Dashboard', to: '/dashboard', isCurrent: true }];
        }

        return pathSegments.map((segment, index) => ({
            label: labelForSegment(segment),
            to: `/${pathSegments.slice(0, index + 1).join('/')}`,
            isCurrent: index === pathSegments.length - 1,
        }));
    }, [pathname]);

    return <Breadcrumb className="flex-1 overflow-hidden">
        <BreadcrumbList className="flex-nowrap overflow-hidden whitespace-nowrap">
            {segments.map((segment, index) => <Fragment key={segment.to}>
                <BreadcrumbItem className="min-w-0">
                    {segment.isCurrent ? <BreadcrumbPage>{segment.label}</BreadcrumbPage> : <BreadcrumbLink to={segment.to}>{segment.label}</BreadcrumbLink>}
                </BreadcrumbItem>
                {index < segments.length - 1 ? <BreadcrumbSeparator /> : null}
            </Fragment>)}
        </BreadcrumbList>
    </Breadcrumb>;
}
