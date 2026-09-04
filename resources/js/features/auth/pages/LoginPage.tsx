import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { ErrorAlert } from '@/Components/common/ErrorAlert';
import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { cn } from '@/lib/utils';

import { AuthLayout } from '../components/AuthLayout';
import { loginSchema, type LoginFormValues } from '../schemas';

interface LoginPageProps {
    /**
     * Submit handler wired by a container/route. Presentational page holds
     * no API logic; it awaits this callback and reflects loading state.
     */
    onSubmit?: (values: LoginFormValues) => Promise<void> | void;
    /**
     * Server-side error to surface above the form (e.g. invalid credentials,
     * inactive account, or rate limiting). The container owns this string so
     * the page stays free of any API/transport logic.
     */
    serverError?: string | null;
    /** Invoked when the user dismisses the server error alert. */
    onDismissError?: () => void;
}


/** Shared input classes so every field shares focus/transition treatment. */
const inputClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

export function LoginPage({
    onSubmit,
    serverError,
    onDismissError,
}: LoginPageProps): JSX.Element {
    const [showPassword, setShowPassword] = useState(false);


    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: { email: '', password: '', rememberMe: false },
    });

    const submit = handleSubmit(async (values) => {
        await onSubmit?.(values);
    });

    return (
        <AuthLayout
            title="Welcome back"
            subtitle="Sign in to manage your rosters, shifts and team."
            footer={
                <span>
                    Don&apos;t have an account?{' '}
                    <Link
                        to="/get-started"
                        className="font-medium text-primary transition-colors hover:text-primary-hover"
                    >
                        Start free trial
                    </Link>
                </span>
            }
        >
            <form onSubmit={submit} noValidate className="space-y-5">
                {/* Server error (invalid credentials, inactive account, rate limit). */}
                {serverError && (
                    <ErrorAlert
                        message={serverError}
                        onDismiss={onDismissError}
                    />
                )}

                {/* Email */}
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
                            aria-describedby={errors.email ? 'email-error' : undefined}
                            className={inputClasses}
                            {...register('email')}
                        />
                    </div>
                    {errors.email && (
                        <p id="email-error" className="text-sm text-danger">
                            {errors.email.message}
                        </p>
                    )}
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <label
                            htmlFor="password"
                            className="block text-sm font-medium text-foreground"
                        >
                            Password
                        </label>
                        <Link
                            to="/forgot-password"
                            className="text-sm font-medium text-primary transition-colors hover:text-primary-hover"
                        >
                            Forgot password?
                        </Link>
                    </div>
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
                            className={cn(inputClasses, 'pr-10')}
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
                    {errors.password && (
                        <p id="password-error" className="text-sm text-danger">
                            {errors.password.message}
                        </p>
                    )}
                </div>

                {/* Remember me */}
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                    <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        {...register('rememberMe')}
                    />
                    Keep me signed in
                </label>

                {/* Submit */}
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
                            <LoadingSpinner className="text-primary-foreground" label="Signing in" />
                            Signing in...
                        </>
                    ) : (
                        'Sign in'
                    )}
                </button>
            </form>
        </AuthLayout>
    );
}
