import {
    AlertTriangle,
    CalendarClock,
    CalendarDays,
    ClipboardCheck,
    Clock3,
    FileText,
    MapPin,
    UserCheck,
    UserRoundX,
    UsersRound,
} from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { StatCard } from '@/Components/common/StatCard';
import { useLeaveRequests } from '@/features/leave-requests/hooks/useLeaveRequests';
import { useRosters } from '@/features/rosters/hooks/useRosters';
import { useShifts } from '@/features/shifts/hooks/useShifts';

const dayKey = (value: string): string => value.slice(0, 10);

/** Formats an ISO `yyyy-MM-dd` date into a compact `MMM d` label. */
function formatDay(value: string): string {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, (month ?? 1) - 1, day ?? 1);
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

/** Formats an `HH:mm` clock time into a 12-hour label. */
function formatTime(value: string): string {
    const [hours = '0', minutes = '0'] = value.split(':');
    const hour = Number(hours);
    const ampm = hour >= 12 ? 'pm' : 'am';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${displayHour}:${minutes}${ampm}`;
}

function toIsoDate(offsetDays: number): string {
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

/** A single operational item surfaced on the dashboard. */
interface TaskItem {
    id: string;
    label: string;
    detail: string;
    to: string;
}

export default function SchedulerDashboard(): JSX.Element {
    const today = toIsoDate(0);
    const tomorrow = toIsoDate(1);

    const rosters = useRosters({ perPage: 100 });
    const todayShifts = useShifts({ dateFrom: today, dateTo: today, perPage: 100 });
    const upcomingShifts = useShifts({ dateFrom: tomorrow, perPage: 5 });
    const leaveRequests = useLeaveRequests({ perPage: 100 });

    const rosterRecords = rosters.data?.data ?? [];
    const draftRosters = rosterRecords.filter((roster) => roster.status === 'draft').length;
    const publishedRosters = rosterRecords.filter((roster) => roster.status === 'published').length;

    const allShiftRecords = useMemo(() => {
        const combined = [...todayShifts.data ?? [], ...upcomingShifts.data ?? []];
        const seen = new Set<string>();
        return combined.filter((shift) => {
            if (seen.has(shift.id)) {
                return false;
            }
            seen.add(shift.id);
            return true;
        });
    }, [todayShifts.data, upcomingShifts.data]);

    const todaysShiftItems = useMemo(
        () => (todayShifts.data ?? []).filter((shift) => shift.status !== 'cancelled'),
        [todayShifts.data],
    );

    // Unassigned (open) shifts in published rosters are real coverage gaps the
    // scheduler can action by assigning a staff member.
    const openShifts = useMemo(
        () =>
            (allShiftRecords).filter(
                (shift) => shift.employeeId === null && shift.rosterStatus === 'published',
            ),
        [allShiftRecords],
    );

    // Leave conflicts: an approved or pending leave request for an employee who
    // is rostered on an overlapping day. Drawn entirely from real query data.
    const leaveConflicts = useMemo(() => {
        const leaveRecords = leaveRequests.data ?? [];
        const conflicts: TaskItem[] = [];
        for (const request of leaveRecords) {
            if (request.status !== 'approved' && request.status !== 'pending') {
                continue;
            }
            for (const shift of allShiftRecords) {
                if (shift.employeeId === null || shift.employeeId !== request.employeeId) {
                    continue;
                }
                const shiftDay = dayKey(shift.date);
                if (shiftDay >= dayKey(request.startDate) && shiftDay <= dayKey(request.endDate)) {
                    conflicts.push({
                        id: `${request.id}-${shift.id}`,
                        label: `${shift.employee?.name ?? 'Rostered employee'} on leave`,
                        detail: `${formatDay(shiftDay)} · ${request.leaveType?.name ?? 'Leave'} (${request.status})`,
                        to: '/leave-requests',
                    });
                }
            }
        }
        return conflicts.slice(0, 5);
    }, [allShiftRecords, leaveRequests.data]);

    const pendingLeaveCount = useMemo(
        () => (leaveRequests.data ?? []).filter((request) => request.status === 'pending').length,
        [leaveRequests.data],
    );

    const tasks = useMemo<TaskItem[]>(() => {
        const items: TaskItem[] = [];
        if (pendingLeaveCount > 0) {
            items.push({
                id: 'leave-pending',
                label: `${pendingLeaveCount} leave request${pendingLeaveCount === 1 ? '' : 's'} to review`,
                detail: 'Approve or decline to keep the week covered.',
                to: '/leave-requests',
            });
        }
        if (draftRosters > 0) {
            items.push({
                id: 'roster-draft',
                label: `${draftRosters} draft roster${draftRosters === 1 ? '' : 's'} not published`,
                detail: 'Publish so employees can see their shifts.',
                to: '/rosters',
            });
        }
        if (openShifts.length > 0) {
            items.push({
                id: 'open-shifts',
                label: `${openShifts.length} unassigned shift${openShifts.length === 1 ? '' : 's'} to cover`,
                detail: 'Assign staff to published coverage gaps.',
                to: '/shifts',
            });
        }
        if (leaveConflicts.length > 0) {
            items.push({
                id: 'leave-conflict',
                label: `${leaveConflicts.length} rostering conflict${leaveConflicts.length === 1 ? '' : 's'} on leave`,
                detail: 'Reassign shifts that overlap approved leave.',
                to: '/rosters',
            });
        }
        return items;
    }, [draftRosters, leaveConflicts.length, openShifts.length, pendingLeaveCount]);

    const isLoading = rosters.isLoading || todayShifts.isLoading || leaveRequests.isLoading;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-sm font-semibold text-primary">SCHEDULING WORKSPACE</p>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                        Keep the week covered.
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Review today's coverage, resolve conflicts and keep published schedules clear.
                    </p>
                </div>
                <Link
                    to="/rosters"
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-input px-4 text-sm font-semibold text-foreground hover:bg-secondary"
                >
                    Open roster calendar
                </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Today's shifts"
                    value={todaysShiftItems.length}
                    icon={CalendarDays}
                    tone="primary"
                    description={formatDay(today)}
                    isLoading={todayShifts.isLoading}
                />
                <StatCard
                    title="Unassigned shifts"
                    value={openShifts.length}
                    icon={UserRoundX}
                    tone="warning"
                    description="Published coverage gaps"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Published rosters"
                    value={publishedRosters}
                    icon={ClipboardCheck}
                    tone="success"
                    description="Visible to employees"
                    isLoading={rosters.isLoading}
                />
                <StatCard
                    title="Pending leave"
                    value={pendingLeaveCount}
                    icon={CalendarClock}
                    tone="danger"
                    description="Awaiting review"
                    isLoading={leaveRequests.isLoading}
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Today's shifts */}
                <section className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-1">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="font-semibold text-foreground">Today's shifts</h2>
                            <p className="mt-1 text-sm text-muted-foreground">Who is rostered today.</p>
                        </div>
                        <Clock3 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="mt-5 divide-y divide-border">
                        {todayShifts.isLoading ? (
                            <div className="h-36 animate-pulse rounded-lg bg-muted" />
                        ) : todaysShiftItems.length ? (
                            todaysShiftItems.slice(0, 6).map((shift) => (
                                <Link
                                    key={shift.id}
                                    to="/shifts"
                                    className="flex items-center justify-between gap-3 py-3 hover:bg-secondary/50"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">
                                            {shift.employee?.name ?? 'Unassigned'}
                                        </p>
                                        <p className="mt-0.5 text-sm text-muted-foreground">
                                            {formatTime(shift.startTime)}–{formatTime(shift.endTime)}
                                            {shift.position?.name ? ` · ${shift.position.name}` : ''}
                                        </p>
                                    </div>
                                    {shift.employeeId === null ? (
                                        <span className="shrink-0 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
                                            Open
                                        </span>
                                    ) : null}
                                </Link>
                            ))
                        ) : (
                            <div className="flex flex-col items-center gap-2 py-10 text-center">
                                <UserCheck className="h-6 w-6 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">No shifts scheduled today.</p>
                            </div>
                        )}
                    </div>
                </section>

                {/* Scheduling tasks */}
                <section className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-1">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="font-semibold text-foreground">Scheduling tasks</h2>
                            <p className="mt-1 text-sm text-muted-foreground">Things that need attention.</p>
                        </div>
                        <ClipboardCheck className="h-5 w-5 text-primary" />
                    </div>
                    <div className="mt-5 space-y-3">
                        {isLoading ? (
                            <div className="h-36 animate-pulse rounded-lg bg-muted" />
                        ) : tasks.length ? (
                            tasks.map((task) => (
                                <Link
                                    key={task.id}
                                    to={task.to}
                                    className="flex items-center gap-3 rounded-xl border border-border p-3 transition hover:border-primary/40 hover:bg-primary/5"
                                >
                                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                                        <AlertTriangle className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-foreground">
                                            {task.label}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {task.detail}
                                        </p>
                                    </div>
                                </Link>
                            ))
                        ) : (
                            <p className="py-10 text-center text-sm text-muted-foreground">
                                All clear — nothing needs attention right now.
                            </p>
                        )}
                    </div>
                </section>

                {/* Leave conflicts */}
                <section className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-1">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="font-semibold text-foreground">Leave conflicts</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Rostered shifts overlapping approved leave.
                            </p>
                        </div>
                        <CalendarClock className="h-5 w-5 text-danger" />
                    </div>
                    <div className="mt-5 divide-y divide-border">
                        {leaveRequests.isLoading ? (
                            <div className="h-36 animate-pulse rounded-lg bg-muted" />
                        ) : leaveConflicts.length ? (
                            leaveConflicts.map((conflict) => (
                                <Link
                                    key={conflict.id}
                                    to={conflict.to}
                                    className="flex items-center gap-3 py-3 hover:bg-secondary/50"
                                >
                                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-danger/10 text-danger">
                                        <AlertTriangle className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-foreground">
                                            {conflict.label}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {conflict.detail}
                                        </p>
                                    </div>
                                </Link>
                            ))
                        ) : (
                            <div className="flex flex-col items-center gap-2 py-10 text-center">
                                <MapPin className="h-6 w-6 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">No leave conflicts detected.</p>
                            </div>
                        )}
                    </div>
                </section>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
                {/* Upcoming shifts */}
                <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="font-semibold text-foreground">Upcoming shifts</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                The next few days of scheduled coverage.
                            </p>
                        </div>
                        <CalendarDays className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="mt-5 divide-y divide-border">
                        {upcomingShifts.isLoading ? (
                            <div className="h-36 animate-pulse rounded-lg bg-muted" />
                        ) : (upcomingShifts.data ?? []).length ? (
                            (upcomingShifts.data ?? []).slice(0, 6).map((shift) => (
                                <Link
                                    key={shift.id}
                                    to="/shifts"
                                    className="flex items-center justify-between gap-4 py-3 hover:bg-secondary/50"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">
                                            {shift.employee?.name ?? 'Unassigned'}
                                        </p>
                                        <p className="mt-0.5 text-sm text-muted-foreground">
                                            {formatDay(dayKey(shift.date))} · {formatTime(shift.startTime)}–
                                            {formatTime(shift.endTime)}
                                        </p>
                                    </div>
                                    <span
                                        className={
                                            shift.rosterStatus === 'published'
                                                ? 'shrink-0 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success'
                                                : 'shrink-0 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning'
                                        }
                                    >
                                        {shift.rosterStatus}
                                    </span>
                                </Link>
                            ))
                        ) : (
                            <p className="py-10 text-center text-sm text-muted-foreground">
                                No upcoming shifts scheduled yet.
                            </p>
                        )}
                    </div>
                </section>

                {/* Roster status */}
                <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        <h2 className="font-semibold text-foreground">Roster status</h2>
                    </div>
                    <div className="mt-5 space-y-3">
                        {rosters.isLoading ? (
                            <div className="h-32 animate-pulse rounded-lg bg-muted" />
                        ) : rosterRecords.length ? (
                            rosterRecords.slice(0, 5).map((roster) => (
                                <Link
                                    key={roster.id}
                                    to={`/rosters/${roster.id}`}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 transition hover:border-primary/40 hover:bg-primary/5"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-foreground">
                                            {roster.branchName ?? 'Company roster'}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {roster.weekStart ? formatDay(roster.weekStart) : ''}
                                            {roster.weekEnd ? ` – ${formatDay(roster.weekEnd)}` : ''}
                                            {roster.shiftsCount != null ? ` · ${roster.shiftsCount} shifts` : ''}
                                        </p>
                                    </div>
                                    <span
                                        className={
                                            roster.status === 'published'
                                                ? 'shrink-0 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success'
                                                : 'shrink-0 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning'
                                        }
                                    >
                                        {roster.status}
                                    </span>
                                </Link>
                            ))
                        ) : (
                            <p className="py-10 text-center text-sm text-muted-foreground">
                                No roster periods are available yet.
                            </p>
                        )}
                    </div>
                    <div className="mt-5 rounded-xl bg-muted/60 p-4">
                        <div className="flex gap-2">
                            <UsersRound className="h-4 w-4 text-primary" />
                            <p className="text-sm font-semibold text-foreground">Scheduler access</p>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            You can manage schedules and review leave, while company settings, plan
                            management and team configuration stay with administrators.
                        </p>
                    </div>
                </section>
            </div>
        </div>
    );
}
