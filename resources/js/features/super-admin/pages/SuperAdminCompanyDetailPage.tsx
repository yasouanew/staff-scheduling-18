import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import {
    AlertTriangle,
    ArrowLeft,
    Ban,
    Building2,
    CheckCircle2,
    CreditCard,
    Globe,
    Mail,
    Pencil,
    Phone,
    Settings,
    ShieldAlert,
    Users,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ErrorBoundary } from '@/Components/common/ErrorBoundary';
import { StatCard } from '@/Components/common/StatCard';
import { LoadingSkeleton } from '@/Components/common/LoadingSkeleton';
import { Badge, type BadgeTone } from '@/Components/ui/badge';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { Company, CompanyStatus } from '@/types/company';
import { COMPANY_STATUS_LABELS } from '@/types/company';

import { CompanyFormModal } from '@/features/companies/components/CompanyFormModal';
import { useCompany, useCompanySubscription, useUpdateCompanyStatus } from '@/features/companies/hooks/useCompanies';

/** Dedicated client so the page works standalone. */
const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

const STATUS_MAP: Record<CompanyStatus, { label: string; tone: BadgeTone; dot: string }> = {
    active: { label: 'Active', tone: 'success', dot: 'bg-success' },
    inactive: { label: 'Inactive', tone: 'neutral', dot: 'bg-muted-foreground' },
    suspended: { label: 'Suspended', tone: 'danger', dot: 'bg-danger' },
};

function CompanyStatusBadge({ status }: { status: CompanyStatus }): JSX.Element {
    const { label, tone, dot } = STATUS_MAP[status];
    return (
        <Badge variant={tone}>
            <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden="true" />
            {label}
        </Badge>
    );
}

function formatDate(value: string | null): string {
    if (!value) return '—';
    try {
        return format(parseISO(value), 'dd MMM yyyy');
    } catch {
        return '—';
    }
}

function subStatusTone(status: string | undefined): BadgeTone {
    switch (status) {
        case 'active':
            return 'success';
        case 'trialing':
            return 'info';
        case 'past_due':
        case 'grace_period':
            return 'warning';
        case 'suspended':
        case 'paused':
            return 'danger';
        case 'incomplete':
        case 'cancelled':
        case 'expired':
            return 'neutral';
        default:
            return 'neutral';
    }
}

function subStatusLabel(status: string | undefined): string {
    if (!status) return 'No subscription';
    switch (status) {
        case 'active':
            return 'Active';
        case 'trialing':
            return 'Trialing';
        case 'past_due':
            return 'Past due';
        case 'grace_period':
            return 'Grace period';
        case 'suspended':
            return 'Suspended';
        case 'paused':
            return 'Paused';
        case 'incomplete':
            return 'Incomplete';
        case 'cancelled':
            return 'Cancelled';
        case 'expired':
            return 'Expired';
        default:
            return status;
    }
}

function InfoRow({
    icon: Icon,
    label,
    value,
}: {
    icon: typeof Mail;
    label: string;
    value: string | null;
}): JSX.Element {
    return (
        <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-muted-foreground">
                <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="truncate text-sm font-medium text-foreground">{value ?? '—'}</p>
            </div>
        </div>
    );
}

function DetailSkeleton(): JSX.Element {
    return (
        <div className="space-y-6" aria-hidden="true">
            <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="h-14 w-14 animate-pulse rounded-xl bg-muted" />
                <div className="space-y-2">
                    <div className="h-6 w-48 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
                <div className="h-56 animate-pulse rounded-xl bg-muted lg:col-span-2" />
                <div className="h-56 animate-pulse rounded-xl bg-muted" />
            </div>
        </div>
    );
}

function CompanyDetail({ id }: { id: string }): JSX.Element {
    const { data: company, isLoading, isError, refetch } = useCompany(id);
    const { data: subscription } = useCompanySubscription(id);
    const updateStatus = useUpdateCompanyStatus();
    const [isEditOpen, setIsEditOpen] = useState(false);

    if (isLoading) return <DetailSkeleton />;

    if (isError || !company) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                    <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                </span>
                <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">Unable to load this company</p>
                    <p className="text-sm text-muted-foreground">The platform query failed. Please try again.</p>
                </div>
                <button
                    type="button"
                    onClick={() => void refetch()}
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    Try again
                </button>
            </div>
        );
    }

    const isSuspended = company.status === 'suspended';

    const handleSuspend = (): void => {
        void updateStatus
            .mutateAsync({ id: company.id, status: 'suspended' })
            .then(() => toast.success(`${company.name} suspended`))
            .catch((error) =>
                toast.error('Unable to suspend company', { description: getApiErrorMessage(error, 'Try again.') }),
            );
    };

    const handleReactivate = (): void => {
        void updateStatus
            .mutateAsync({ id: company.id, status: 'active' })
            .then(() => toast.success(`${company.name} reactivated`))
            .catch((error) =>
                toast.error('Unable to reactivate company', { description: getApiErrorMessage(error, 'Try again.') }),
            );
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2 text-sm">
                <Link
                    to="/super-admin/companies"
                    className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Companies
                </Link>
            </div>

            {/* Profile header */}
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent text-lg font-semibold text-accent-foreground">
                        {company.logo ? (
                            <img src={company.logo} alt={`${company.name} logo`} className="h-full w-full object-cover" />
                        ) : (
                            company.name.slice(0, 1).toUpperCase()
                        )}
                    </span>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-xl font-semibold tracking-tight text-foreground">
                                {company.name}
                            </h1>
                            <CompanyStatusBadge status={company.status} />
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Tenant since {formatDate(company.createdAt)}
                        </p>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setIsEditOpen(true)}
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        Edit
                    </button>
                    <Link
                        to={`/super-admin/companies/${id}/settings`}
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <Settings className="h-4 w-4" aria-hidden="true" />
                        Settings
                    </Link>
                    {isSuspended ? (
                        <button
                            type="button"
                            onClick={handleReactivate}
                            disabled={updateStatus.isPending}
                            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
                        >
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                            {updateStatus.isPending ? 'Reactivating…' : 'Reactivate'}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleSuspend}
                            disabled={updateStatus.isPending}
                            className="inline-flex h-10 items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
                        >
                            <Ban className="h-4 w-4" aria-hidden="true" />
                            {updateStatus.isPending ? 'Suspending…' : 'Suspend'}
                        </button>
                    )}
                </div>
            </div>

            {/* Aggregation ribbon */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                    title="Branches"
                    value={company.branchesCount ?? 0}
                    icon={Building2}
                    tone="primary"
                    description="Across this tenant"
                />
                <StatCard
                    title="Employees"
                    value={company.employeesCount ?? 0}
                    icon={Users}
                    tone="info"
                    description="Across this tenant"
                />
                <StatCard
                    title="User accounts"
                    value={company.usersCount ?? 0}
                    icon={ShieldAlert}
                    tone="warning"
                    description="Linked to this tenant"
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Information */}
                <section className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
                    <h2 className="mb-4 text-base font-semibold tracking-tight text-foreground">Information</h2>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <InfoRow icon={Mail} label="Email" value={company.email} />
                        <InfoRow icon={Phone} label="Phone" value={company.phone} />
                        <InfoRow icon={Globe} label="Country" value={company.country} />
                        <InfoRow icon={Building2} label="Business type" value={company.businessType} />
                    </div>
                    <dl className="mt-6 divide-y divide-border">
                        <div className="flex items-center justify-between gap-4 py-2">
                            <dt className="text-sm text-muted-foreground">ABN</dt>
                            <dd className="text-right text-sm font-medium text-foreground">{company.abn ?? '—'}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-4 py-2">
                            <dt className="text-sm text-muted-foreground">Timezone</dt>
                            <dd className="text-right text-sm font-medium text-foreground">{company.timezone ?? '—'}</dd>
                        </div>
                    </dl>
                </section>

                {/* Subscription & billing status */}
                <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <h2 className="mb-4 text-base font-semibold tracking-tight text-foreground">
                        Plan & Billing
                    </h2>
                    {!subscription ? (
                        <div className="flex flex-col items-center gap-3 py-6 text-center">
                            <CreditCard className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                            <p className="text-sm text-muted-foreground">This company has no active subscription.</p>
                        </div>
                    ) : (
                        <dl className="space-y-4">
                            <div>
                                <dt className="text-xs text-muted-foreground">Plan</dt>
                                <dd className="mt-1 text-sm font-semibold text-foreground">
                                    {subscription.planName ?? '—'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs text-muted-foreground">Status</dt>
                                <dd className="mt-1">
                                    <Badge variant={subStatusTone(subscription.status)}>
                                        {subStatusLabel(subscription.status)}
                                    </Badge>
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs text-muted-foreground">Billing cycle</dt>
                                <dd className="mt-1 text-sm font-medium text-foreground capitalize">
                                    {subscription.billingCycle?.replace('_', ' ') ?? '—'}
                                </dd>
                            </div>
                            {subscription.onTrial && (
                                <div>
                                    <dt className="text-xs text-muted-foreground">Trial ends</dt>
                                    <dd className="mt-1 text-sm font-medium text-foreground">
                                        {formatDate(subscription.trialEndsAt)}
                                    </dd>
                                </div>
                            )}
                        </dl>
                    )}
                </section>
            </div>

            <CompanyFormModal
                open={isEditOpen}
                onOpenChange={setIsEditOpen}
                company={company}
            />
        </div>
    );
}

export default function SuperAdminCompanyDetailPage(): JSX.Element {
    const { id } = useParams<{ id: string }>();
    return (
        <QueryClientProvider client={queryClient}>
            <ErrorBoundary
                title="Company details unavailable"
                description="An unexpected error interrupted the company view. You can retry safely."
            >
                {id ? <CompanyDetail id={id} /> : <DetailSkeleton />}
            </ErrorBoundary>
        </QueryClientProvider>
    );
}
