import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { cn } from '@/lib/utils';

import { AuthLayout } from '../components/AuthLayout';
import { confirmPasswordSchema, type ConfirmPasswordFormValues } from '../schemas';

interface ConfirmPasswordPageProps {
    /**
     * Submit handler wired by a container/route. The presentational page holds
     * no API logic; it awaits this callback and reflects loading state. Throwing
     * (e.g. on an incorrect password) keeps the user on the form.
     */
    onSubmit?: (values: ConfirmPasswordFormValues) => Promise<void> | void;
    /** Optional cancel action (e.g. navigate back). Renders a Cancel button. */
    onCancel?: () => void;
    /** Server-side error (e.g. "The provided password is incorrect."). */
    serverError?: string | null;
}

const inputClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background pl-10 pr-10 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

/**
 * Presentational "confirm your password" screen.
 *
 * Re-authenticates the current user before a sensitive action. Validates only
 * the presence of the current password (no strength rules) and delegates the
 * actual verification to {@link ConfirmPasswordPageProps.onSubmit}.
 */
export function ConfirmPasswordPage({
    onSubmit,
    onCancel,
    serverError,
}: ConfirmPasswordPageProps): JSX.Element {
    const [showPassword, setShowPassword] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<ConfirmPasswordFormValues>({
        resolver: zodResolver(confirmPasswordSchema),
        defaultValues: { password: '' },
    });

    const submit = handleSubmit(async (values) => {
        await onSubmit?.(values);
    });

    return (
        <AuthLayout
            title="Confirm your password"
            subtitle="For your security, please confirm your password to continue."
        >
            <form onSubmit={submit} noValidate className="space-y-5">
                <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <p className="text-xs text-muted-foreground">
                        This is a secure area of the application. Please confirm your password
                        before continuing.
                    </p>
                </div>

                {serverError ? (
                    <p role="alert" className="text-sm text-danger">
                        {serverError}
                    </p>
                ) : null}

                <div className="space-y-1.5">
                    <label htmlFor="password" className="block text-sm font-medium text-foreground">
                        Password
                    </label>
                    <div className="relative">
                        <Lock
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            placeholder="Enter your password"
                            aria-invalid={Boolean(errors.password)}
                            aria-describedby={errors.password ? 'password-error' : undefined}
                            className={inputClasses}
                            {...register('password')}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {showPassword ? (
                                <EyeOff className="h-4 w-4" aria-hidden="true" />
                            ) : (
                                <Eye className="h-4 w-4" aria-hidden="true" />
                            )}
                        </button>
                    </div>
                    {errors.password ? (
                        <p id="password-error" className="text-sm text-danger">
                            {errors.password.message}
                        </p>
                    ) : null}
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                    {onCancel ? (
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={isSubmitting}
                            className={cn(
                                'inline-flex h-11 w-full items-center justify-center rounded-lg border border-input bg-background px-4 text-sm font-semibold text-foreground shadow-sm transition-colors',
                                'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                                'disabled:cursor-not-allowed disabled:opacity-70',
                            )}
                        >
                            Cancel
                        </button>
                    ) : null}

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
                                    label="Confirming password"
                                />
                                Confirming...
                            </>
                        ) : (
                            'Confirm'
                        )}
                    </button>
                </div>
            </form>
        </AuthLayout>
    );
}
