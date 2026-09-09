import { AlertTriangle, Building2, CheckCircle2, MapPin, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { StatCard } from '@/Components/common/StatCard';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { BRANCH_STATUS_LABELS, BRANCH_STATUSES, type Branch, type BranchStatus } from '@/types/branch';

import { BranchesTable } from '../components/BranchesTable';
import { BranchFormModal } from '../components/BranchFormModal';
import { useBranches, useDeleteBranch } from '../hooks/useBranches';

/** Sentinel representing "no filter applied" in the select controls. */
const ALL_VALUE = 'all';

/** Shared select styling for the filter toolbar. */
const selectClasses = cn(
    'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground sm:w-44',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

/**
 * Branches list page (`/branches`).
 *
 * Owns the server-side status filter that drives the {@link useBranches} query,
 * and delegates search / sorting / pagination / column visibility to the
 * reusable {@link BranchesTable}. Creating and editing flow through the
 * {@link BranchFormModal}; deletion runs through the dedicated mutation with a
 * confirmation dialog (in the table) and toast feedback. Relies on the
 * app-level QueryClient.
 */
export function BranchesListPage(): JSX.Element {
    const navigate = useNavigate();

    const [status, setStatus] = useState<BranchStatus | typeof ALL_VALUE>(ALL_VALUE);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editing, setEditing] = useState<Branch | null>(null);

    const { data, isLoading, isError, refetch, isFetching } = useBranches({
        status: status === ALL_VALUE ? undefined : status,
        perPage: 100,
    });

    const deleteBranch = useDeleteBranch();

    const branches = useMemo(() => data?.data ?? [], [data]);
    const total = data?.meta?.total ?? branches.length;

    const counts = useMemo(
        () =>
            branches.reduce(
                (acc, branch) => {
                    if (branch.status === 'active') acc.active += 1;
                    else acc.inactive += 1;
                    return acc;
                },
                { active: 0, inactive: 0 },
            ),
        [branches],
    );

    const handleDelete = (branch: Branch): void => {
        deleteBranch.mutate(branch.id, {
            onSuccess: () =>
                toast.success('Branch deleted', {
                    description: `${branch.name} has been removed.`,
                }),
            onError: (error) =>
                toast.error('Unable to delete branch', {
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
                        Branches
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Manage your company&apos;s operating locations.
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
                    New branch
                </button>
            </div>

            {/* KPI summary row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                    title="Total Branches"
                    value={total}
                    icon={Building2}
                    tone="primary"
                    description="Operating locations"
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
                    icon={MapPin}
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
                            Unable to load branches
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Something went wrong while fetching operating locations.
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
                                setStatus(event.target.value as BranchStatus | typeof ALL_VALUE)
                            }
                            aria-label="Filter by status"
                            className={selectClasses}
                        >
                            <option value={ALL_VALUE}>All statuses</option>
                            {BRANCH_STATUSES.map((option) => (
                                <option key={option} value={option}>
                                    {BRANCH_STATUS_LABELS[option]}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Branches table */}
                    <BranchesTable
                        branches={branches}
                        isLoading={isLoading || (isFetching && branches.length === 0)}
                        onView={(branch) => navigate(`/branches/${branch.id}`)}
                        onEdit={(branch) => setEditing(branch)}
                        onDelete={handleDelete}
                    />
                </>
            )}

            {/* Create drawer */}
            <BranchFormModal open={isCreateOpen} onOpenChange={setIsCreateOpen} />

            {/* Edit drawer */}
            <BranchFormModal
                open={editing !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setEditing(null);
                    }
                }}
                branch={editing}
            />
        </div>
    );
}

export default BranchesListPage;
