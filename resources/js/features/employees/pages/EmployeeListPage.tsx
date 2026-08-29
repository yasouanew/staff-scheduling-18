import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { format, parseISO } from 'date-fns';
import {
    AlertTriangle,
    CalendarClock,
    Search,
    UserPlus,
    Users,
    UserCheck,
    UserCog,
} from 'lucide-react';

import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { StatCard } from '@/Components/common/StatCard';
import { StatusBadge } from '@/Components/common/StatusBadge';
import { DataTable } from '@/Components/tables/DataTable';
import { useBranchOptions } from '@/features/branches/hooks/useBranches';
import { useDepartmentOptions } from '@/features/departments/hooks/useDepartments';
import { cn } from '@/lib/utils';
import { type Employee } from '@/types/employee';


import { AddEmployeeModal } from '../components/AddEmployeeModal';
import { EditEmployeeModal } from '../components/EditEmployeeModal';
import { EmployeeRowActions } from '../components/EmployeeRowActions';
import { SendInviteModal } from '../components/SendInviteModal';
import { deriveEmployeeStats, useEmployees } from '../hooks/useEmployees';

/** Dedicated client so the feature works standalone without global setup. */
const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

/** Sentinel value representing "no filter applied" in the select controls. */
const ALL_VALUE = 'all';

/** Derives up-to-two uppercase initials from a full name. */
function getInitials(name: string): string {
    return name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('');
}

/** Presentational avatar with image + initials fallback. */
function EmployeeAvatar({ employee }: { employee: Employee }): JSX.Element {
    return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-xs font-semibold text-accent-foreground">
            {employee.avatarUrl ? (
                <img
                    src={employee.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                />
            ) : (
                getInitials(employee.name)
            )}
        </span>
    );
}

/** Shared select styling for the filter toolbar. */
const selectClasses = cn(
    'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground sm:w-44',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

/** Row-level intents the directory table raises for its parent to handle. */
interface EmployeeRowHandlers {
    onEdit: (employee: Employee) => void;
    onSendInvite: (employee: Employee) => void;
}

/**
 * Builds the employee directory table columns.
 *
 * A factory (rather than a module-level constant) is required because the final
 * column renders the row menu, which must call back into the page's dialog
 * state. The result is memoised by the caller so TanStack Table does not see a
 * new column identity on every render.
 */
function buildColumns({ onEdit, onSendInvite }: EmployeeRowHandlers): ColumnDef<Employee>[] {
    return [
        {
            id: 'name',
            accessorKey: 'name',
            header: 'Employee',
            cell: ({ row }) => {
                const employee = row.original;
                return (
                    <div className="flex items-center gap-3">
                        <EmployeeAvatar employee={employee} />
                        <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{employee.name}</p>
                            <p className="truncate text-xs text-muted-foreground sm:hidden">
                                {employee.email}
                            </p>
                        </div>
                    </div>
                );
            },
        },
        {
            id: 'email',
            accessorKey: 'email',
            header: 'Email',
            cell: ({ row }) => (
                <span className="text-muted-foreground">{row.original.email}</span>
            ),
            meta: { headerClassName: 'hidden sm:table-cell', cellClassName: 'hidden sm:table-cell' },
        },
        {
            id: 'position',
            accessorKey: 'position',
            header: 'Position',
            meta: { headerClassName: 'hidden lg:table-cell', cellClassName: 'hidden lg:table-cell' },
        },
        {
            id: 'department',
            accessorKey: 'department',
            header: 'Department',
            meta: { headerClassName: 'hidden md:table-cell', cellClassName: 'hidden md:table-cell' },
        },
        {
            id: 'branch',
            accessorKey: 'branchName',
            header: 'Branch',
            cell: ({ row }) =>
                row.original.branchName ? (
                    <Link
                        to={`/branches/${row.original.branchId}`}
                        className="rounded text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {row.original.branchName}
                    </Link>
                ) : (
                    <span className="text-muted-foreground">Unassigned</span>
                ),
            meta: { headerClassName: 'hidden md:table-cell', cellClassName: 'hidden md:table-cell' },
        },
        {
            id: 'status',
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => <StatusBadge status={row.original.status} />,
        },
        {
            id: 'joinedDate',
            accessorKey: 'joinedDate',
            header: 'Joined',
            cell: ({ row }) => (
                <span className="whitespace-nowrap text-muted-foreground">
                    {format(parseISO(row.original.joinedDate), 'dd MMM yyyy')}
                </span>
            ),
            // Least vital column: hidden on mobile per responsive rules.
            meta: { headerClassName: 'hidden md:table-cell', cellClassName: 'hidden md:table-cell' },
        },
        {
            id: 'availability',
            header: 'Availability',
            enableSorting: false,
            enableHiding: false,
            cell: ({ row }) => (
                <Link
                    to={`/employees/${row.original.id}/availability`}
                    aria-label={`Manage weekly availability for ${row.original.name}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <CalendarClock aria-hidden="true" className="size-3.5" />
                    Manage
                </Link>
            ),
            // Secondary to the row menu, which carries the same action on small screens.
            meta: {
                headerClassName: 'hidden text-right lg:table-cell',
                cellClassName: 'hidden text-right lg:table-cell',
            },
        },
        {
            id: 'actions',
            // The column is self-explanatory from its icon; a visible label would
            // only add noise, so it is exposed to assistive tech instead.
            header: () => <span className="sr-only">Actions</span>,
            enableSorting: false,
            enableHiding: false,
            cell: ({ row }) => (
                <EmployeeRowActions
                    employee={row.original}
                    onEdit={onEdit}
                    onSendInvite={onSendInvite}
                />
            ),
            meta: { headerClassName: 'w-12 text-right', cellClassName: 'text-right' },
        },
    ];
}

/** Inner directory view (relies on an ancestor QueryClientProvider). */
function EmployeeDirectory(): JSX.Element {
    const [search, setSearch] = useState('');
    const [branchId, setBranchId] = useState<string>(ALL_VALUE);
    const [departmentId, setDepartmentId] = useState<string>(ALL_VALUE);

    const [isModalOpen, setIsModalOpen] = useState(false);

    /*
     * Row-menu dialogs are driven by the selected employee rather than a boolean
     * so the forms can hydrate from the row that was clicked, and only one
     * instance of each dialog is ever mounted regardless of table size.
     */
    const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);
    const [employeeToInvite, setEmployeeToInvite] = useState<Employee | null>(null);

    // Branch and department narrowing happen server-side; search stays client-side.
    const { data, isLoading, isError, refetch } = useEmployees({
        branchId: branchId === ALL_VALUE ? undefined : branchId,
        departmentId: departmentId === ALL_VALUE ? undefined : departmentId,
    });
    const { data: branchOptions = [], isLoading: isLoadingBranches } = useBranchOptions();
    const { data: departmentOptions = [], isLoading: isLoadingDepartments } =
        useDepartmentOptions();


    const employees = useMemo(() => data ?? [], [data]);
    const stats = useMemo(() => deriveEmployeeStats(employees), [employees]);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();

        return employees.filter((employee) => {
            const matchesSearch =
                query.length === 0 ||
                employee.name.toLowerCase().includes(query) ||
                employee.email.toLowerCase().includes(query) ||
                employee.position.toLowerCase().includes(query);

            return matchesSearch;
        });
    }, [employees, search]);


    /** Name of the active branch filter, used for empty-state messaging. */
    const activeBranchName = useMemo(
        () => branchOptions.find((option) => option.id === branchId)?.name ?? null,
        [branchOptions, branchId],
    );

    // Stable identities keep the memoised column definitions from being rebuilt.
    const handleEdit = useCallback((employee: Employee) => setEmployeeToEdit(employee), []);
    const handleSendInvite = useCallback((employee: Employee) => setEmployeeToInvite(employee), []);

    const columns = useMemo(
        () => buildColumns({ onEdit: handleEdit, onSendInvite: handleSendInvite }),
        [handleEdit, handleSendInvite],
    );

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        Employee Directory
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Manage your team, invite new members and track employment status.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className={cn(
                        'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors',
                        'hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    )}
                >
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                    Add employee
                </button>
            </div>

            {/* KPI summary row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard
                    title="Total Employees"
                    value={stats.total}
                    icon={Users}
                    tone="primary"
                    description="Across all branches"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Active Staff"
                    value={stats.active}
                    icon={UserCheck}
                    tone="success"
                    description="Currently employed"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Pending Invites"
                    value={stats.pending}
                    icon={UserCog}
                    tone="warning"
                    description="Awaiting acceptance"
                    isLoading={isLoading}
                />
            </div>

            {/* Error state */}
            {isError ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                            Unable to load employees
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Something went wrong while fetching your team.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void refetch()}
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Try again
                    </button>
                </div>
            ) : (
                <>
                    {/* Filter toolbar */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="relative w-full sm:max-w-xs">
                            <Search
                                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <input
                                type="search"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search name, email or role..."
                                aria-label="Search employees"
                                className={cn(
                                    'h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm text-foreground',
                                    'placeholder:text-muted-foreground',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                )}
                            />
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <select
                                value={branchId}
                                onChange={(event) => setBranchId(event.target.value)}
                                disabled={isLoadingBranches}
                                aria-label="Filter by branch"
                                className={cn(selectClasses, 'disabled:opacity-60')}
                            >
                                <option value={ALL_VALUE}>
                                    {isLoadingBranches ? 'Loading branches...' : 'All branches'}
                                </option>
                                {branchOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.name}
                                    </option>
                                ))}
                            </select>

                            <select
                                value={departmentId}
                                onChange={(event) => setDepartmentId(event.target.value)}
                                disabled={isLoadingDepartments}
                                aria-label="Filter by department"
                                className={cn(selectClasses, 'disabled:opacity-60')}
                            >
                                <option value={ALL_VALUE}>
                                    {isLoadingDepartments
                                        ? 'Loading departments...'
                                        : 'All departments'}
                                </option>
                                {departmentOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.name}
                                    </option>
                                ))}
                            </select>

                        </div>
                    </div>

                    {/* Active branch context so users know the list is scoped */}
                    {activeBranchName ? (
                        <p className="text-sm text-muted-foreground">
                            Showing employees at{' '}
                            <span className="font-medium text-foreground">{activeBranchName}</span>.{' '}
                            <button
                                type="button"
                                onClick={() => setBranchId(ALL_VALUE)}
                                className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                Clear branch filter
                            </button>
                        </p>
                    ) : null}

                    {/* Directory table */}
                    <DataTable<Employee, unknown>
                        columns={columns}
                        data={filtered}
                        isLoading={isLoading}
                    />
                </>
            )}

            <AddEmployeeModal open={isModalOpen} onOpenChange={setIsModalOpen} />

            {/* Row-menu dialogs: closing clears the selection so they unmount cleanly. */}
            <EditEmployeeModal
                employee={employeeToEdit}
                onOpenChange={(open) => {
                    if (!open) setEmployeeToEdit(null);
                }}
            />
            <SendInviteModal
                employee={employeeToInvite}
                onOpenChange={(open) => {
                    if (!open) setEmployeeToInvite(null);
                }}
            />
        </div>
    );
}

/**
 * Company Admin Employee Directory page. Owns the feature-scoped QueryClient
 * and composes the KPI summary, filter toolbar, data table and add-employee
 * drawer. All data flows through the isolated `useEmployees` mock layer.
 */
export default function EmployeeListPage(): JSX.Element {
    return (
        <QueryClientProvider client={queryClient}>
            <EmployeeDirectory />
        </QueryClientProvider>
    );
}
