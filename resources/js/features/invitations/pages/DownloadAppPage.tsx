import { Apple, Clock, Mail, Smartphone } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { cn } from '@/lib/utils';

import { useMobileAppLinks } from '../hooks/useInvitation';

/** One step in the "what happens next" walkthrough. */
interface OnboardingStep {
    title: string;
    description: string;
}

/**
 * Mirrors the mobile onboarding flow exactly: install, enter email, receive a
 * code by email, verify it, then choose a password.
 */
const STEPS: ReadonlyArray<OnboardingStep> = [
    {
        title: 'Install the app',
        description: 'Download it from the App Store or Google Play using the buttons above.',
    },
    {
        title: 'Enter your work email',
        description: 'Open the app and type the email address this invitation was sent to.',
    },
    {
        title: 'Enter your verification code',
        description: 'We will email you a 6-digit code. Type it into the app to confirm it is you.',
    },
    {
        title: 'Choose your password',
        description: 'Create a password and you are in — your shifts and roster are ready.',
    },
];

/** Shared styling for the two store buttons. */
const storeButtonClasses = cn(
    'inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors',
    'hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
);

/**
 * Public landing page that employee invitation emails point at.
 *
 * Employees have no browser access to the dashboard, so this page never asks for
 * a password. Its only job is to get the app installed and then set expectations
 * for the in-app email → code → password flow, echoing the invited address so the
 * employee knows exactly which one to type in.
 */
export default function DownloadAppPage(): JSX.Element {
    const [params] = useSearchParams();
    const email = params.get('email');

    const { data: links, isLoading } = useMobileAppLinks();

    // Until the apps are published the config URLs are empty, so we show a
    // "coming soon" note rather than buttons that lead nowhere.
    const hasAnyLink = Boolean(links?.iosUrl ?? links?.androidUrl);

    return (
        <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
            <div className="w-full max-w-lg space-y-6">
                {/* Header */}
                <div className="space-y-3 text-center">
                    <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Smartphone aria-hidden="true" className="size-7" />
                    </span>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        Get the app to see your shifts
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        You have been added to your team&apos;s roster. Everything you need lives in
                        the mobile app.
                    </p>
                </div>

                <div className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm">
                    {/* The address the app will ask for */}
                    {email ? (
                        <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Sign in with this email
                            </p>
                            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                                <Mail aria-hidden="true" className="size-4 text-primary" />
                                <span className="truncate">{email}</span>
                            </p>
                        </div>
                    ) : null}

                    {/* Store buttons */}
                    {isLoading ? (
                        <div
                            className="flex gap-3"
                            aria-hidden="true"
                        >
                            <div className="h-12 flex-1 animate-pulse rounded-lg bg-muted" />
                            <div className="h-12 flex-1 animate-pulse rounded-lg bg-muted" />
                        </div>
                    ) : hasAnyLink ? (
                        <div className="flex flex-col gap-3 sm:flex-row">
                            {links?.iosUrl ? (
                                <a
                                    href={links.iosUrl}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className={storeButtonClasses}
                                >
                                    <Apple aria-hidden="true" className="size-4" />
                                    App Store
                                </a>
                            ) : null}
                            {links?.androidUrl ? (
                                <a
                                    href={links.androidUrl}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className={storeButtonClasses}
                                >
                                    <Smartphone aria-hidden="true" className="size-4" />
                                    Google Play
                                </a>
                            ) : null}
                        </div>
                    ) : (
                        <div className="flex items-start gap-3 rounded-lg border border-border bg-warning/10 p-4">
                            <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
                            <p className="text-sm text-foreground">
                                The app is on its way to the stores. Your manager will let you know
                                the moment it is available to download.
                            </p>
                        </div>
                    )}

                    {/* What happens next */}
                    <div className="space-y-3">
                        <h2 className="text-sm font-semibold text-foreground">
                            What happens next
                        </h2>
                        <ol className="space-y-3">
                            {STEPS.map((step, index) => (
                                <li key={step.title} className="flex gap-3">
                                    <span
                                        aria-hidden="true"
                                        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                                    >
                                        {index + 1}
                                    </span>
                                    <div className="space-y-0.5">
                                        <p className="text-sm font-medium text-foreground">
                                            {step.title}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {step.description}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </div>
                </div>

                <p className="text-center text-sm text-muted-foreground">
                    Trouble getting in? Contact your manager and they can send this invitation
                    again.
                </p>
            </div>
        </main>
    );
}
