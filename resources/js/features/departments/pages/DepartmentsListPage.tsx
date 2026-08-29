import { AlertTriangle, CheckCircle2, Layers, Network, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { StatCard } from '@/Components/common/StatCard';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
    DEPARTMENT_STATUS_LABELS,
    DEPARTMENT_STATUSES,
    type Department,
    type DepartmentStatus,
} from '@/types/department';

import { DepartmentFormModal } from '../components/DepartmentFormModal';
import { DepartmentsTable } from '../components/DepartmentsTable';
import { useDeleteDepartment, useDepartments } from '../hooks/useDepartments';

/** Sentinel representing "no filter applied" in the select controls. */
const ALL_VALUE = 'all';

/** Shared select styling for the filter toolbar. */
const selectClasses = cn(
    'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground sm:w-44',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

/**
 * Departments list page (`/departments`).
 *
 * Owns the server-side status filter that drives the {@link useDepartments}
 * query, and delegates search / sorting / pagination / column visibility to the
 * reusable {@link DepartmentsTable}. Creating and editing flow through the
 * {@link DepartmentFormModal}; deletion runs through the dedicated mutation with
 * a confirmation dialog (in the table) and toast feedback. Relies on the
 * app-level QueryClient.
 */
export function DepartmentsListPage(): JSX.Element {
    const [status, setStatus] = useState<DepartmentStatus | typeof ALL_VALUE>(ALL_VALUE);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editing, setEditing] = useState<Department | null>(null);

    const { data, isLoading, isError, refetch, isFetching } = useDepartments({
        status: status === ALL_VALUE ? undefined : status,
        perPage: 100,
    });

    const deleteDepartment = useDeleteDepartment();

    const departments = useMemo(() => data?.data ?? [], [data]);
    const total = data?.meta?.total ?? departments.length;

    const counts = useMemo(
        () =>
            departments.reduce(
                (acc, department) => {
                    if (department.status === 'active') acc.active += 1;
                    else acc.inactive += 1;
                    return acc;
                },
                { active: 0, inactive: 0 },
            ),
        [departments],
    );

    const handleDelete = (department: Department): void => {
        deleteDepartment.mutate(department.id, {
            onSuccess: () =>
                toast.success('Department deleted', {
                    description: `${department.name} has been removed.`,
                }),
            onError: (error) =>
                toast.error('Unable to delete department', {
                    description: getApiErrorMessage(error, 'Please try again.'),
                }),
        });
    };

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        Departments
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Organise your positions and staff into functional teams.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsCreateOpen(true)}
                    className={cn(
                        'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors',
                        'hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    )}
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    New department
                </button>
            </div>

            {/* KPI summary row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                    title="Total Departments"
                    value={total}
                    icon={Network}
                    tone="primary"
                    description="Functional teams"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Active"
                    value={counts.active}
                    icon={CheckCircle2}
                    tone="success"
                    description="Currently active"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Inactive"
                    value={counts.inactive}
                    icon={Layers}
                    tone="warning"
                    description="Not in use"
                    isLoading={isLoading}
                />
            </div>

            {isError ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                            Unable to load departments
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Something went wrong while fetching your departments.
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
                    {/* Filter toolbar (server-side status) */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                        <select
                            value={status}
                            onChange={(event) =>
                                setStatus(event.target.value as DepartmentStatus | typeof ALL_VALUE)
                            }
                            aria-label="Filter by status"
                            className={selectClasses}
                        >
                            <option value={ALL_VALUE}>All statuses</option>
                            {DEPARTMENT_STATUSES.map((option) => (
                                <option key={option} value={option}>
                                    {DEPARTMENT_STATUS_LABELS[option]}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Departments table */}
                    <DepartmentsTable
                        departments={departments}
                        isLoading={isLoading || (isFetching && departments.length === 0)}
                        onEdit={(department) => setEditing(department)}
                        onDelete={handleDelete}
                    />
                </>
            )}

            {/* Create drawer */}
            <DepartmentFormModal open={isCreateOpen} onOpenChange={setIsCreateOpen} />

            {/* Edit drawer */}
            <DepartmentFormModal
                open={editing !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setEditing(null);
                    }
                }}
                department={editing}
            />
        </div>
    );
}

export default DepartmentsListPage;
