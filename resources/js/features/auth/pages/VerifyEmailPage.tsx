import { CheckCircle2, MailCheck, MailWarning, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { cn } from '@/lib/utils';

import { AuthLayout } from '../components/AuthLayout';

/**
 * Outcome of an email-verification attempt.
 *
 * Mirrors the `status` query param the backend appends when it redirects the
 * user from a signed verification link into the SPA:
 *  - `verified`         → the link was valid and the email is now confirmed.
 *  - `already-verified` → the link was valid but the email was already confirmed.
 *  - `invalid`          → the link was expired, malformed, or tampered with.
 *  - `pending`          → no link followed yet; prompt the user to check inbox.
 */
export type VerifyEmailStatus = 'verified' | 'already-verified' | 'invalid' | 'pending';

interface VerifyEmailPageProps {
    /** The verification outcome to render. Defaults to `pending`. */
    status?: VerifyEmailStatus;
    /**
     * Optional resend handler. When provided, a "Resend verification email"
     * action is shown for the `pending` and `invalid` states. Resolving
     * successfully should surface its own feedback (e.g. a toast).
     */
    onResend?: () => Promise<void> | void;
    /** Reflects an in-flight resend request to drive the button's spinner. */
    isResending?: boolean;
}

/** Visual + copy configuration for each verification outcome. */
interface StatusConfig {
    icon: typeof CheckCircle2;
    iconWrapClass: string;
    title: string;
    subtitle: string;
    body: string;
    showResend: boolean;
}

const STATUS_CONFIG: Record<VerifyEmailStatus, StatusConfig> = {
    verified: {
        icon: CheckCircle2,
        iconWrapClass: 'bg-success/10 text-success',
        title: 'Email verified',
        subtitle: 'Your email address has been confirmed.',
        body: "You're all set. You can now sign in and access your workspace.",
        showResend: false,
    },
    'already-verified': {
        icon: MailCheck,
        iconWrapClass: 'bg-info/10 text-info',
        title: 'Already verified',
        subtitle: 'This email address was confirmed previously.',
        body: 'There is nothing more to do here — just sign in to continue.',
        showResend: false,
    },
    invalid: {
        icon: MailWarning,
        iconWrapClass: 'bg-danger/10 text-danger',
        title: 'Link no longer valid',
        subtitle: 'This verification link is invalid or has expired.',
        body: 'Verification links are single-use and time-limited. Request a fresh link and we will email it to you right away.',
        showResend: true,
    },
    pending: {
        icon: MailCheck,
        iconWrapClass: 'bg-primary/10 text-primary',
        title: 'Verify your email',
        subtitle: 'Check your inbox to confirm your address.',
        body: "We've sent a verification link to your email. Click it to activate your account. Didn't get it? Resend it below.",
        showResend: true,
    },
};

/**
 * Presentational email-verification result screen.
 *
 * Holds no data-fetching logic: the outcome arrives via {@link VerifyEmailPageProps.status}
 * and any resend request is delegated to {@link VerifyEmailPageProps.onResend}.
 */
export function VerifyEmailPage({
    status = 'pending',
    onResend,
    isResending = false,
}: VerifyEmailPageProps): JSX.Element {
    const config = STATUS_CONFIG[status];
    const Icon = config.icon;
    const canResend = config.showResend && Boolean(onResend);

    return (
        <AuthLayout
            title={config.title}
            subtitle={config.subtitle}
            footer={
                <Link
                    to="/login"
                    className="font-medium text-primary transition-colors hover:text-primary-hover"
                >
                    Return to sign in
                </Link>
            }
        >
            <div className="flex flex-col items-center gap-5 py-2 text-center">
                <span
                    className={cn(
                        'flex h-14 w-14 items-center justify-center rounded-full',
                        config.iconWrapClass,
                    )}
                >
                    <Icon className="h-7 w-7" aria-hidden="true" />
                </span>

                <p className="text-sm text-muted-foreground">{config.body}</p>

                {status === 'verified' || status === 'already-verified' ? (
                    <Link
                        to="/login"
                        className={cn(
                            'inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors',
                            'hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        )}
                    >
                        Continue to sign in
                    </Link>
                ) : null}

                {canResend ? (
                    <button
                        type="button"
                        onClick={() => void onResend?.()}
                        disabled={isResending}
                        className={cn(
                            'inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-semibold text-foreground shadow-sm transition-colors',
                            'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                            'disabled:cursor-not-allowed disabled:opacity-70',
                        )}
                    >
                        {isResending ? (
                            <>
                                <LoadingSpinner label="Resending verification email" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                                Resend verification email
                            </>
                        )}
                    </button>
                ) : null}
            </div>
        </AuthLayout>
    );
}
