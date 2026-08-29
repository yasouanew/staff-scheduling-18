import { AlertTriangle, Ban, Building2, CheckCircle2, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { StatCard } from '@/Components/common/StatCard';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
    BUSINESS_TYPE_OPTIONS,
    COMPANY_STATUSES,
    COMPANY_STATUS_LABELS,
    type Company,
    type CompanyStatus,
} from '@/types/company';

import { CompaniesTable } from '../components/CompaniesTable';
import { CompanyFormModal } from '../components/CompanyFormModal';
import { useCompanies, useUpdateCompanyStatus } from '../hooks/useCompanies';

/** Sentinel representing "no filter applied" in the select controls. */
const ALL_VALUE = 'all';

/** Shared select styling for the filter toolbar. */
const selectClasses = cn(
    'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground sm:w-44',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

/**
 * Companies list page (`/companies`).
 *
 * Owns the server-side filters (status + industry) that drive the
 * {@link useCompanies} query, and delegates search / sorting / pagination /
 * column visibility to the reusable {@link CompaniesTable}. Creating and editing
 * flow through the {@link CompanyFormModal}; status transitions run through the
 * dedicated mutation with toast feedback. Relies on the app-level QueryClient.
 */
export function CompaniesListPage(): JSX.Element {
    const navigate = useNavigate();

    const [status, setStatus] = useState<CompanyStatus | typeof ALL_VALUE>(ALL_VALUE);
    const [businessType, setBusinessType] = useState<string>(ALL_VALUE);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editing, setEditing] = useState<Company | null>(null);

    const { data, isLoading, isError, refetch, isFetching } = useCompanies({
        status: status === ALL_VALUE ? undefined : status,
        businessType: businessType === ALL_VALUE ? undefined : businessType,
        perPage: 100,
    });

    const updateStatus = useUpdateCompanyStatus();

    const companies = useMemo(() => data?.data ?? [], [data]);
    const total = data?.meta?.total ?? companies.length;

    const counts = useMemo(
        () =>
            companies.reduce(
                (acc, company) => {
                    if (company.status === 'active') acc.active += 1;
                    if (company.status === 'suspended') acc.suspended += 1;
                    return acc;
                },
                { active: 0, suspended: 0 },
            ),
        [companies],
    );

    const handleStatusChange = (company: Company, next: CompanyStatus): void => {
        updateStatus.mutate(
            { id: company.id, status: next },
            {
                onSuccess: () =>
                    toast.success('Status updated', {
                        description: `${company.name} is now ${COMPANY_STATUS_LABELS[next].toLowerCase()}.`,
                    }),
                onError: (error) =>
                    toast.error('Unable to update status', {
                        description: getApiErrorMessage(error, 'Please try again.'),
                    }),
            },
        );
    };

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        Companies
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Manage tenant organisations, their profiles and account status.
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
                    New company
                </button>
            </div>

            {/* KPI summary row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                    title="Total Companies"
                    value={total}
                    icon={Building2}
                    tone="primary"
                    description="On the platform"
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
                    title="Suspended"
                    value={counts.suspended}
                    icon={Ban}
                    tone="danger"
                    description="Access paused"
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
                            Unable to load companies
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Something went wrong while fetching organisations.
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
                    {/* Filter toolbar (server-side status + industry) */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                        <select
                            value={status}
                            onChange={(event) =>
                                setStatus(event.target.value as CompanyStatus | typeof ALL_VALUE)
                            }
                            aria-label="Filter by status"
                            className={selectClasses}
                        >
                            <option value={ALL_VALUE}>All statuses</option>
                            {COMPANY_STATUSES.map((option) => (
                                <option key={option} value={option}>
                                    {COMPANY_STATUS_LABELS[option]}
                                </option>
                            ))}
                        </select>

                        <select
                            value={businessType}
                            onChange={(event) => setBusinessType(event.target.value)}
                            aria-label="Filter by industry"
                            className={selectClasses}
                        >
                            <option value={ALL_VALUE}>All industries</option>
                            {BUSINESS_TYPE_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Companies table */}
                    <CompaniesTable
                        companies={companies}
                        isLoading={isLoading || (isFetching && companies.length === 0)}
                        onView={(company) => navigate(`/companies/${company.id}`)}
                        onEdit={(company) => setEditing(company)}
                        onStatusChange={handleStatusChange}
                    />
                </>
            )}

            {/* Create drawer */}
            <CompanyFormModal open={isCreateOpen} onOpenChange={setIsCreateOpen} />

            {/* Edit drawer */}
            <CompanyFormModal
                open={editing !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setEditing(null);
                    }
                }}
                company={editing}
            />
        </div>
    );
}

export default CompaniesListPage;
