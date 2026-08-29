import { CalendarDays, ClipboardCheck, Clock3, FileText, MapPin, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useRosters } from '@/features/rosters/hooks/useRosters';
import { StatCard } from '@/Components/common/StatCard';

const quickActions = [
    { to: '/rosters', label: 'Prepare roster', detail: 'Build and publish the next week', icon: CalendarDays },
    { to: '/shifts/create', label: 'Add shift', detail: 'Fill a coverage gap quickly', icon: Clock3 },
    { to: '/leave-requests', label: 'Review leave', detail: 'Approve or decline pending requests', icon: ClipboardCheck },
];

export default function SchedulerDashboard(): JSX.Element {
    const rosters = useRosters({ perPage: 5 });
    const records = rosters.data?.data ?? [];
    const published = records.filter((roster) => roster.status === 'published').length;
    const drafts = records.filter((roster) => roster.status === 'draft').length;
    const shifts = records.reduce((total, roster) => total + (roster.shiftsCount ?? 0), 0);

    return <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-sm font-semibold text-primary">SCHEDULING WORKSPACE</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Keep the week covered.</h1><p className="mt-1 text-sm text-muted-foreground">Build reliable rosters, respond to staffing changes and keep published schedules clear.</p></div>
            <Link to="/rosters/calendar" className="inline-flex h-10 items-center justify-center rounded-lg border border-input px-4 text-sm font-semibold text-foreground hover:bg-secondary">Open roster calendar</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard title="Recent rosters" value={records.length} icon={CalendarDays} tone="primary" description="Available planning periods" isLoading={rosters.isLoading} />
            <StatCard title="Published" value={published} icon={ClipboardCheck} tone="success" description="Ready for the team" isLoading={rosters.isLoading} />
            <StatCard title="Planned shifts" value={shifts} icon={Clock3} tone="warning" description="Across recent rosters" isLoading={rosters.isLoading} />
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-foreground">Recent rosters</h2><p className="mt-1 text-sm text-muted-foreground">Continue planning or check published coverage.</p></div><FileText className="h-5 w-5 text-muted-foreground"/></div><div className="mt-5 divide-y divide-border">{rosters.isLoading ? <div className="h-36 animate-pulse rounded-lg bg-muted" /> : records.length ? records.map((roster) => <Link key={roster.id} to={`/rosters/${roster.id}`} className="flex items-center justify-between gap-4 py-4 hover:bg-secondary/50"><div><p className="font-semibold text-foreground">{roster.branchName ?? 'Company roster'}</p><p className="mt-1 text-sm text-muted-foreground">{roster.weekStart ?? 'No start date'} to {roster.weekEnd ?? 'No end date'} · {roster.shiftsCount ?? 0} shifts</p></div><span className={roster.status === 'published' ? 'rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success' : 'rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning'}>{roster.status}</span></Link>) : <p className="py-10 text-center text-sm text-muted-foreground">No roster periods are available yet.</p>}</div></section>
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm"><div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary"/><h2 className="font-semibold text-foreground">Quick actions</h2></div><div className="mt-4 space-y-3">{quickActions.map(({to,label,detail,icon:Icon}) => <Link key={to} to={to} className="flex items-center gap-3 rounded-xl border border-border p-3 transition hover:border-primary/40 hover:bg-primary/5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4"/></span><div><p className="text-sm font-semibold text-foreground">{label}</p><p className="text-xs text-muted-foreground">{detail}</p></div></Link>)}</div><div className="mt-5 rounded-xl bg-muted/60 p-4"><div className="flex gap-2"><UsersRound className="h-4 w-4 text-primary"/><p className="text-sm font-semibold text-foreground">Scheduler access</p></div><p className="mt-2 text-xs leading-5 text-muted-foreground">You can manage schedules and review leave, while company settings, plan management and team configuration stay with administrators.</p></div></section>
        </div>
    </div>;
}
