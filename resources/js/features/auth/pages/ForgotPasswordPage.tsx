import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { cn } from '@/lib/utils';

import { AuthLayout } from '../components/AuthLayout';
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '../schemas';

interface ForgotPasswordPageProps {
    /**
     * Submit handler wired by a container/route. Resolving successfully
     * flips the page into its confirmation state.
     */
    onSubmit?: (values: ForgotPasswordFormValues) => Promise<void> | void;
}

const inputClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

/** Shared "back to sign in" routing link used in the layout footer. */
function BackToLogin(): JSX.Element {
    return (
        <Link
            to="/login"
            className="inline-flex items-center gap-1.5 font-medium text-primary transition-colors hover:text-primary-hover"
        >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to sign in
        </Link>
    );
}

export function ForgotPasswordPage({ onSubmit }: ForgotPasswordPageProps): JSX.Element {
    const {
        register,
        handleSubmit,
        getValues,
        formState: { errors, isSubmitting, isSubmitSuccessful },
    } = useForm<ForgotPasswordFormValues>({
        resolver: zodResolver(forgotPasswordSchema),
        defaultValues: { email: '' },
    });

    const submit = handleSubmit(async (values) => {
        await onSubmit?.(values);
    });

    // Success confirmation state.
    if (isSubmitSuccessful) {
        return (
            <AuthLayout
                title="Check your inbox"
                subtitle="We've sent password reset instructions to your email."
                footer={<BackToLogin />}
            >
                <div className="flex flex-col items-center gap-4 py-4 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
                        <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
                    </span>
                    <p className="text-sm text-muted-foreground">
                        If an account exists for{' '}
                        <span className="font-medium text-foreground">{getValues('email')}</span>,
                        you&apos;ll receive a link to reset your password shortly.
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Didn&apos;t receive it? Check your spam folder or try again in a few minutes.
                    </p>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            title="Forgot password?"
            subtitle="Enter your work email and we'll send you a reset link."
            footer={<BackToLogin />}
        >
            <form onSubmit={submit} noValidate className="space-y-5">
                <div className="space-y-1.5">
                    <label htmlFor="email" className="block text-sm font-medium text-foreground">
                        Work email
                    </label>
                    <div className="relative">
                        <Mail
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <input
                            id="email"
                            type="email"
                            autoComplete="email"
                            placeholder="you@company.com.au"
                            aria-invalid={Boolean(errors.email)}
                            aria-describedby={errors.email ? 'email-error' : 'email-hint'}
                            className={inputClasses}
                            {...register('email')}
                        />
                    </div>
                    {errors.email ? (
                        <p id="email-error" className="text-sm text-danger">
                            {errors.email.message}
                        </p>
                    ) : (
                        <p id="email-hint" className="text-sm text-muted-foreground">
                            We&apos;ll only use this to send your reset link.
                        </p>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={isSubmitting}
                    className={cn(
                        'inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors',
                        'hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        'disabled:cursor-not-allowed disabled:opacity-70',
                    )}
                >
                    {isSubmitting ? (
                        <>
                            <LoadingSpinner
                                className="text-primary-foreground"
                                label="Sending reset link"
                            />
                            Sending link...
                        </>
                    ) : (
                        'Send reset link'
                    )}
                </button>
            </form>
        </AuthLayout>
    );
}
