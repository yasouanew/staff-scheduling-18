import { format, parseISO } from 'date-fns';
import {
    AlertTriangle,
    Briefcase,
    Building2,
    ChevronRight,
    Clock,
    Globe,
    Mail,
    MapPin,
    Pencil,
    Phone,
    Settings,
    Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { StatCard } from '@/Components/common/StatCard';
import { cn } from '@/lib/utils';
import { TIMEZONE_LABELS, type Company } from '@/types/company';

import { CompaniesTableInitials } from '../components/company-initials';
import { CompanyFormModal } from '../components/CompanyFormModal';
import { CompanyStatusBadge } from '../components/CompanyStatusBadge';
import { SubscriptionSummaryCard } from '../components/SubscriptionSummaryCard';
import { useCompany, useCompanySubscription } from '../hooks/useCompanies';

/** A single icon + label + value line inside an info card. */
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

/** Breadcrumb trail: Companies › {name}. */
function Breadcrumb({ name }: { name: string }): JSX.Element {
    return (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
            <Link
                to="/companies"
                className="text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
                Companies
            </Link>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="truncate font-medium text-foreground" aria-current="page">
                {name}
            </span>
        </nav>
    );
}

/** Full-page loading skeleton for the detail view. */
function DetailSkeleton(): JSX.Element {
    return (
        <div className="space-y-6" aria-hidden="true">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="h-16 w-16 animate-pulse rounded-xl bg-muted" />
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

/** Formats an ISO date to `dd MMM yyyy`, falling back to an em dash. */
function formatDate(value: string | null): string {
    if (!value) return '—';
    try {
        return format(parseISO(value), 'dd MMM yyyy');
    } catch {
        return '—';
    }
}

/** The resolved detail content once the company has loaded. */
function CompanyDetail({ id, company }: { id: string; company: Company }): JSX.Element {
    const { data: subscription, isLoading: subscriptionLoading } = useCompanySubscription(id);
    const [isEditOpen, setIsEditOpen] = useState(false);

    const timezoneLabel = company.timezone
        ? (TIMEZONE_LABELS[company.timezone] ?? company.timezone)
        : null;
    const location = [company.state, company.country].filter(Boolean).join(', ') || null;

    return (
        <div className="space-y-6">
            <Breadcrumb name={company.name} />

            {/* Profile header */}
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent text-lg font-semibold text-accent-foreground">
                        {company.logo ? (
                            <img
                                src={company.logo}
                                alt=""
                                className="h-full w-full object-contain"
                            />
                        ) : (
                            CompaniesTableInitials(company.name) || (
                                <Building2 className="h-7 w-7" aria-hidden="true" />
                            )
                        )}
                    </span>
                    <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                                {company.name}
                            </h1>
                            <CompanyStatusBadge status={company.status} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {company.businessType ?? 'No industry set'}
                            {company.abn ? ` · ABN ${company.abn}` : ''}
                        </p>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setIsEditOpen(true)}
                        className={cn(
                            'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors',
                            'hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        )}
                    >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        Edit
                    </button>
                    <Link
                        to={`/companies/${id}/settings`}
                        className={cn(
                            'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors',
                            'hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        )}
                    >
                        <Settings className="h-4 w-4" aria-hidden="true" />
                        Settings
                    </Link>
                </div>
            </div>

            {/* Relation counts */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                    title="Employees"
                    value={company.employeesCount ?? 0}
                    icon={Users}
                    tone="primary"
                    description="Active staff records"
                />
                <StatCard
                    title="Branches"
                    value={company.branchesCount ?? 0}
                    icon={MapPin}
                    tone="info"
                    description="Operating locations"
                />
                <StatCard
                    title="User accounts"
                    value={company.usersCount ?? 0}
                    icon={Briefcase}
                    tone="success"
                    description="Linked logins"
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Contact + business info */}
                <section
                    aria-labelledby="company-info-heading"
                    className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm lg:col-span-2"
                >
                    <h2
                        id="company-info-heading"
                        className="text-base font-semibold text-foreground"
                    >
                        Company information
                    </h2>
                    <div className="grid gap-5 sm:grid-cols-2">
                        <InfoRow icon={Mail} label="Email" value={company.email} />
                        <InfoRow icon={Phone} label="Phone" value={company.phone} />
                        <InfoRow icon={MapPin} label="Location" value={location} />
                        <InfoRow icon={Globe} label="Country" value={company.country} />
                        <InfoRow icon={Clock} label="Timezone" value={timezoneLabel} />
                        <InfoRow
                            icon={Briefcase}
                            label="Industry"
                            value={company.businessType}
                        />
                    </div>
                    <div className="grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
                        <InfoRow
                            icon={Clock}
                            label="Created"
                            value={formatDate(company.createdAt)}
                        />
                        <InfoRow
                            icon={Clock}
                            label="Last updated"
                            value={formatDate(company.updatedAt)}
                        />
                    </div>
                </section>

                {/* Current subscription (subscription_id relation) */}
                <SubscriptionSummaryCard
                    subscription={subscription ?? null}
                    isLoading={subscriptionLoading}
                />
            </div>

            <CompanyFormModal open={isEditOpen} onOpenChange={setIsEditOpen} company={company} />
        </div>
    );
}

/**
 * Company detail page (`/companies/:id`).
 *
 * Fetches the company and its current subscription, and renders the profile
 * header, relation-count stat cards, a company-information panel and the
 * subscription summary. Handles loading (skeleton), error, and not-found states
 * explicitly. Editing opens the shared {@link CompanyFormModal}; settings live
 * on a dedicated sub-route.
 */
export function CompanyDetailPage(): JSX.Element {
    const { id = '' } = useParams<{ id: string }>();
    const { data: company, isLoading, isError, refetch } = useCompany(id);

    if (isLoading) {
        return <DetailSkeleton />;
    }

    if (isError || !company) {
        return (
            <div className="space-y-6">
                <Breadcrumb name="Not found" />
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Company not found</p>
                        <p className="text-sm text-muted-foreground">
                            This company may have been removed, or you may not have access.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => void refetch()}
                            className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            Try again
                        </button>
                        <Link
                            to="/companies"
                            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            Back to companies
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return <CompanyDetail id={id} company={company} />;
}

export default CompanyDetailPage;
