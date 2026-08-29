import { CalendarRange, ShieldCheck, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

import { ThemeToggle } from '@/Components/ui/theme-toggle';

interface AuthLayoutProps {
    /** Heading shown above the form card. */
    title: string;
    /** Supporting description shown beneath the title. */
    subtitle: string;
    /** Form content rendered inside the card. */
    children: ReactNode;
    /** Optional footer node (e.g. routing links). */
    footer?: ReactNode;
}

/** Marketing highlights shown on the split-screen brand panel. */
const HIGHLIGHTS: ReadonlyArray<{ icon: typeof Sparkles; text: string }> = [
    { icon: Sparkles, text: 'Effortless rostering for every branch and team.' },
    { icon: ShieldCheck, text: 'Enterprise-grade security, built for Australian compliance.' },
];

/**
 * Split-screen authentication shell. A branded gradient panel sits on the
 * left (desktop only) while the form card is centered on the right. Fully
 * responsive and dark-mode aware; holds no data-fetching logic.
 */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps): JSX.Element {
    return (
        <div className="relative min-h-screen bg-background text-foreground lg:grid lg:grid-cols-2">
            {/* Theme control: unauthenticated visitors need it too, because the
                dashboard header (the only other toggle) is not reachable yet. */}
            <div className="absolute right-4 top-4 z-20">
                <ThemeToggle />
            </div>

            {/* Brand panel (desktop). */}
            <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
                {/* Soft blur gradients. */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary-foreground/20 blur-3xl"
                />
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-info/30 blur-3xl"
                />

                <div className="relative flex items-center gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/15 backdrop-blur">
                        <CalendarRange className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <span className="text-lg font-semibold tracking-tight">ShiftFlow</span>
                </div>

                <div className="relative space-y-6">
                    <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">
                        Scheduling that keeps your workforce in perfect sync.
                    </h2>
                    <ul className="space-y-4">
                        {HIGHLIGHTS.map(({ icon: Icon, text }) => (
                            <li key={text} className="flex items-start gap-3">
                                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/15 backdrop-blur">
                                    <Icon className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <span className="text-sm text-primary-foreground/90">{text}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="relative text-xs text-primary-foreground/70">
                    &copy; {new Date().getFullYear()} ShiftFlow. All rights reserved.
                </p>
            </aside>

            {/* Form panel with subtle background grid. */}
            <main className="relative flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,theme(colors.border)_1px,transparent_1px),linear-gradient(to_bottom,theme(colors.border)_1px,transparent_1px)] bg-[size:40px_40px] opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
                />

                <div className="relative w-full max-w-md">
                    {/* Mobile brand mark. */}
                    <div className="mb-8 flex items-center justify-center gap-2 lg:hidden">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                            <CalendarRange className="h-6 w-6" aria-hidden="true" />
                        </span>
                        <span className="text-lg font-semibold tracking-tight">ShiftFlow</span>
                    </div>

                    <div className="rounded-2xl border border-border bg-card p-6 shadow-lg sm:p-8">
                        <div className="mb-6 space-y-1.5">
                            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                                {title}
                            </h1>
                            <p className="text-sm text-muted-foreground">{subtitle}</p>
                        </div>

                        {children}
                    </div>

                    {footer && (
                        <div className="mt-6 text-center text-sm text-muted-foreground">
                            {footer}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
