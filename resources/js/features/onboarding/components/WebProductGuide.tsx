import * as Dialog from '@radix-ui/react-dialog';
import { CheckCircle2, Compass, Sparkles, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import type { WebRole } from '@/features/auth/hooks/useWebSession';
import { useProductGuide, type ProductGuideTip } from '../hooks/useProductGuide';

const tipForPath = (pathname: string): { key: ProductGuideTip; title: string; body: string } | null => {
    if (pathname === '/dashboard') return { key: 'dashboard', title: 'Your starting point', body: 'This dashboard highlights the next useful action for your role. Use the left navigation whenever you are ready to explore.' };
    if (pathname.startsWith('/rosters')) return { key: 'rosters', title: 'Build, then publish', body: 'Prepare a roster as a draft, add shifts and publish only when the team is ready to see it.' };
    if (pathname.startsWith('/shifts')) return { key: 'shifts', title: 'Keep shifts clear', body: 'Add the date, times and position first, then assign an available employee when you are ready.' };
    if (pathname.startsWith('/leave-requests')) return { key: 'leave_requests', title: 'Keep leave moving', body: 'Review dates and coverage before approving or declining a request. Employees receive a decision notification.' };
    if (pathname.startsWith('/employees')) return { key: 'employees', title: 'Your team directory', body: 'Add staff details and invite team members when they need browser or mobile access.' };
    if (pathname.startsWith('/settings')) return { key: 'settings', title: 'Make it yours', body: 'Return here later to update company settings, local time rules and operational defaults.' };
    return null;
};

export function WebProductGuide({ role }: { role: WebRole | null }): JSX.Element | null {
    const { pathname } = useLocation();
    const guide = useProductGuide();
    if (!role || role === 'employee' || !guide.user) return null;
    const tip = tipForPath(pathname);
    const welcomeSteps = role === 'scheduler'
        ? ['Open Roster calendar to plan the week.', 'Use Shifts to fill coverage gaps.', 'Review leave requests before publishing.']
        : ['Add your team and operating locations when ready.', 'Build a roster, then publish it to the team.', 'Use leave and settings as your operation grows.'];
    const closeWelcome = (): void => { void guide.completeWelcome(); };
    const closeTip = (): void => { if (tip) void guide.dismissTip(tip.key); };
    return <>
        <Dialog.Root open={guide.shouldShowWelcome} onOpenChange={(open) => { if (!open) closeWelcome(); }}>
            <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm"/><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-2xl focus:outline-none"><Dialog.Title className="flex items-center gap-2 text-xl font-semibold text-foreground"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-5 w-5"/></span>Welcome to your workspace</Dialog.Title><Dialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">You are ready to start. This is a one-time guide, not a training course—use only the steps that help today.</Dialog.Description><ol className="mt-5 space-y-3">{welcomeSteps.map((step,index)=><li key={step} className="flex items-center gap-3 rounded-xl bg-muted/60 p-3 text-sm text-foreground"><span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index+1}</span>{step}</li>)}</ol><div className="mt-6 flex justify-end"><Dialog.Close asChild><button type="button" disabled={guide.isSaving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"><CheckCircle2 className="h-4 w-4"/>Start exploring</button></Dialog.Close></div></Dialog.Content></Dialog.Portal>
        </Dialog.Root>
        {!guide.shouldShowWelcome && tip && !guide.isTipDismissed(tip.key) && <aside className="fixed bottom-5 right-5 z-30 w-[min(23rem,calc(100%-2.5rem))] rounded-2xl border border-primary/20 bg-card p-4 shadow-2xl shadow-foreground/10" aria-label="Helpful feature tip"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Compass className="h-4 w-4"/></span><div className="min-w-0 flex-1"><p className="font-semibold text-foreground">{tip.title}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{tip.body}</p><button type="button" onClick={closeTip} disabled={guide.isSaving} className="mt-3 text-sm font-semibold text-primary hover:text-primary-hover disabled:opacity-60">Got it</button></div><button type="button" onClick={closeTip} aria-label="Dismiss tip" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4"/></button></div></aside>}
    </>;
}
