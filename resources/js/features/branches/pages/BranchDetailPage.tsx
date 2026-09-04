import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { format, parseISO } from 'date-fns';
import {
    AlertTriangle,
    Briefcase,
    Building2,
    CalendarClock,
    ChevronRight,
    Clock,
    MapPin,
    Navigation,
    Phone,
    Trash2,
    UserCog,
    Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { StatCard } from '@/Components/common/StatCard';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { TIMEZONE_LABELS, WEEKDAY_LABELS, type Branch } from '@/types/branch';

import { BranchFormModal } from '../components/BranchFormModal';
import { BranchScheduleCard } from '../components/BranchScheduleCard';
import { BranchStatusBadge } from '../components/BranchStatusBadge';
import { useBranch, useDeleteBranch } from '../hooks/useBranches';
import { currentWeekdayFor, formatTradingWindow } from '../lib/format-schedule';



/** A single icon + label + value line inside an info card. */
function InfoRow({
    icon: Icon,
    label,
    value,
}: {
    icon: typeof Phone;
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

/** Breadcrumb trail: Branches › {name}. */
function Breadcrumb({ name }: { name: string }): JSX.Element {
    return (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
            <Link
                to="/branches"
                className="rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                Branches
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

/** Formats a lat/long pair into a compact coordinate string. */
function formatCoordinates(branch: Branch): string | null {
    if (branch.latitude === null || branch.longitude === null) {
        return null;
    }
    return `${branch.latitude.toFixed(5)}, ${branch.longitude.toFixed(5)}`;
}

/** The resolved detail content once the branch has loaded. */
function BranchDetail({ branch }: { branch: Branch }): JSX.Element {
    const navigate = useNavigate();
    const deleteBranch = useDeleteBranch();

    const [isEditOpen, setIsEditOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const timezoneLabel = branch.timezone
        ? (TIMEZONE_LABELS[branch.timezone] ?? branch.timezone)
        : null;

    /*
     * Today's hours are resolved against the *branch* timezone, not the viewer's:
     * a Perth branch opened from a Sydney desk is often on a different day, and
     * showing the wrong day's hours is worse than showing none.
     */
    const today = currentWeekdayFor(branch.timezone);
    const todaySchedule = today ? branch.daySchedules[today] : null;
    const todayValue = !todaySchedule
        ? '—'
        : !todaySchedule.isOpen
            ? 'Closed'
            : (formatTradingWindow(todaySchedule.opensAt, todaySchedule.closesAt) ?? 'Not set');


    const handleDelete = (): void => {
        deleteBranch.mutate(branch.id, {
            onSuccess: () => {
                toast.success('Branch deleted', {
                    description: `${branch.name} has been removed.`,
                });
                navigate('/branches', { replace: true });
            },
            onError: (error) =>
                toast.error('Unable to delete branch', {
                    description: getApiErrorMessage(error, 'Please try again.'),
                }),
        });
    };

    return (
        <div className="space-y-6">
            <Breadcrumb name={branch.name} />

            {/* Profile header */}
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                        <Building2 className="h-7 w-7" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                                {branch.name}
                            </h1>
                            <BranchStatusBadge status={branch.status} />
                        </div>
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            {branch.address ?? 'No address set'}
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
                        Edit
                    </button>
                    <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className={cn(
                            'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground shadow-sm transition-colors',
                            'hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        )}
                    >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Delete
                    </button>
                </div>
            </div>

            {/* Relation counts + today's trading hours */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard
                    title="Employees"
                    value={branch.employeesCount ?? 0}
                    icon={Users}
                    tone="primary"
                    description="Staff linked to this branch"
                />
                <StatCard
                    title="User accounts"
                    value={branch.usersCount ?? 0}
                    icon={Briefcase}
                    tone="info"
                    description="Directly provisioned accounts"
                />
                <StatCard
                    title="Shifts"
                    value={branch.shiftsCount ?? 0}
                    icon={CalendarClock}
                    tone="success"
                    description="Scheduled at this location"
                />
                <StatCard
                    title="Open today"
                    value={todayValue}
                    icon={Clock}
                    tone={todaySchedule?.isOpen ? 'success' : 'warning'}
                    description={
                        today ? `${WEEKDAY_LABELS[today]} in branch time` : 'Timezone not set'
                    }
                />
            </div>

            {/* Trading hours & break policy */}
            <BranchScheduleCard branch={branch} onEdit={() => setIsEditOpen(true)} />

            <div className="grid gap-6 lg:grid-cols-3">

                {/* Branch info */}
                <section
                    aria-labelledby="branch-info-heading"
                    className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm lg:col-span-2"
                >
                    <h2 id="branch-info-heading" className="text-base font-semibold text-foreground">
                        Branch information
                    </h2>
                    <div className="grid gap-5 sm:grid-cols-2">
                        <InfoRow icon={UserCog} label="Manager" value={branch.manager?.name ?? null} />
                        <InfoRow icon={Phone} label="Phone" value={branch.phone} />
                        <InfoRow icon={MapPin} label="Address" value={branch.address} />
                        <InfoRow icon={Clock} label="Timezone" value={timezoneLabel} />
                        <InfoRow
                            icon={Navigation}
                            label="Coordinates"
                            value={formatCoordinates(branch)}
                        />
                    </div>
                    <div className="grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
                        <InfoRow icon={Clock} label="Created" value={formatDate(branch.createdAt)} />
                        <InfoRow
                            icon={Clock}
                            label="Last updated"
                            value={formatDate(branch.updatedAt)}
                        />
                    </div>
                </section>

                {/* Owning company */}
                <section
                    aria-labelledby="branch-company-heading"
                    className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
                >
                    <h2
                        id="branch-company-heading"
                        className="text-base font-semibold text-foreground"
                    >
                        Company
                    </h2>
                    <InfoRow icon={Building2} label="Owning company" value={branch.companyName} />
                    <Link
                        to="/employees"
                        className={cn(
                            'inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors',
                            'hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        )}
                    >
                        <Users className="h-4 w-4" aria-hidden="true" />
                        View employees
                    </Link>
                </section>
            </div>

            {/* Edit drawer */}
            <BranchFormModal open={isEditOpen} onOpenChange={setIsEditOpen} branch={branch} />

            {/* Delete confirmation */}
            <AlertDialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                    <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl focus:outline-none">
                        <AlertDialog.Title className="text-lg font-semibold text-foreground">
                            Delete {branch.name}?
                        </AlertDialog.Title>
                        <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                            This will permanently remove the branch and cannot be undone. Employees
                            and shifts linked to this location may be affected.
                        </AlertDialog.Description>
                        <div className="mt-6 flex justify-end gap-3">
                            <AlertDialog.Cancel asChild>
                                <button
                                    type="button"
                                    className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    Cancel
                                </button>
                            </AlertDialog.Cancel>
                            <AlertDialog.Action asChild>
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={deleteBranch.isPending}
                                    className="inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    {deleteBranch.isPending ? 'Deleting…' : 'Delete branch'}
                                </button>
                            </AlertDialog.Action>
                        </div>
                    </AlertDialog.Content>
                </AlertDialog.Portal>
            </AlertDialog.Root>
        </div>
    );
}

/**
 * Branch detail page (`/branches/:id`).
 *
 * Fetches a single branch and renders the profile header, relation-count stat
 * cards and an information panel. Handles loading (skeleton), error and
 * not-found states explicitly. Editing opens the shared {@link BranchFormModal};
 * deleting is confirmed via an alert dialog and returns the user to the list.
 */
export function BranchDetailPage(): JSX.Element {
    const { id = '' } = useParams<{ id: string }>();
    const { data: branch, isLoading, isError, refetch } = useBranch(id);

    if (isLoading) {
        return <DetailSkeleton />;
    }

    if (isError || !branch) {
        return (
            <div className="space-y-6">
                <Breadcrumb name="Not found" />
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Branch not found</p>
                        <p className="text-sm text-muted-foreground">
                            This branch may have been removed, or you may not have access.
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
                            to="/branches"
                            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            Back to branches
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return <BranchDetail branch={branch} />;
}

export default BranchDetailPage;
