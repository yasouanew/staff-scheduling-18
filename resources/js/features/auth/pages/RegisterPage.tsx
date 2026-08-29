import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Eye, EyeOff, Lock, Mail, Phone, User } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { ErrorAlert } from '@/Components/common/ErrorAlert';
import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { cn } from '@/lib/utils';

import { AuthLayout } from '../components/AuthLayout';
import { registerSchema, type RegisterFormValues } from '../schemas';

interface RegisterPageProps {
    /**
     * Submit handler wired by a container/route. This presentational page holds
     * no API logic; it awaits the callback and reflects loading state.
     */
    onSubmit?: (values: RegisterFormValues) => Promise<void> | void;
    /**
     * Server-side error to surface above the form (e.g. email already taken,
     * validation, or rate limiting). The container owns this string so the page
     * stays free of any API/transport concerns.
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

export function RegisterPage({
    onSubmit,
    serverError,
    onDismissError,
}: RegisterPageProps): JSX.Element {
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<RegisterFormValues>({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            name: '',
            companyName: '',
            email: '',
            phone: '',
            password: '',
            confirmPassword: '',
            acceptTerms: false,
        },
    });

    const submit = handleSubmit(async (values) => {
        await onSubmit?.(values);
    });

    return (
        <AuthLayout
            title="Start your free trial"
            subtitle="Create your company workspace to manage rosters, shifts and staff."
            footer={
                <span>
                    Already have an account?{' '}
                    <Link
                        to="/login"
                        className="font-medium text-primary transition-colors hover:text-primary-hover"
                    >
                        Sign in
                    </Link>
                </span>
            }
        >
            <form onSubmit={submit} noValidate className="space-y-5">
                {/* Server error (duplicate email, validation, rate limit). */}
                {serverError && <ErrorAlert message={serverError} onDismiss={onDismissError} />}

                {/* Full name */}
                <div className="space-y-1.5">
                    <label htmlFor="name" className="block text-sm font-medium text-foreground">
                        Full name
                    </label>
                    <div className="relative">
                        <User
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <input
                            id="name"
                            type="text"
                            autoComplete="name"
                            placeholder="Jane Smith"
                            aria-invalid={Boolean(errors.name)}
                            aria-describedby={errors.name ? 'name-error' : undefined}
                            className={inputClasses}
                            {...register('name')}
                        />
                    </div>
                    {errors.name && (
                        <p id="name-error" className="text-sm text-danger">
                            {errors.name.message}
                        </p>
                    )}
                </div>

                {/* Company name */}
                <div className="space-y-1.5">
                    <label
                        htmlFor="companyName"
                        className="block text-sm font-medium text-foreground"
                    >
                        Company name
                    </label>
                    <div className="relative">
                        <Building2
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <input
                            id="companyName"
                            type="text"
                            autoComplete="organization"
                            placeholder="Acme Hospitality Pty Ltd"
                            aria-invalid={Boolean(errors.companyName)}
                            aria-describedby={errors.companyName ? 'companyName-error' : undefined}
                            className={inputClasses}
                            {...register('companyName')}
                        />
                    </div>
                    {errors.companyName && (
                        <p id="companyName-error" className="text-sm text-danger">
                            {errors.companyName.message}
                        </p>
                    )}
                </div>

                {/* Work email */}
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

                {/* Phone (optional) */}
                <div className="space-y-1.5">
                    <label htmlFor="phone" className="block text-sm font-medium text-foreground">
                        Phone{' '}
                        <span className="font-normal text-muted-foreground">(optional)</span>
                    </label>
                    <div className="relative">
                        <Phone
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <input
                            id="phone"
                            type="tel"
                            autoComplete="tel"
                            placeholder="04xx xxx xxx"
                            aria-invalid={Boolean(errors.phone)}
                            aria-describedby={errors.phone ? 'phone-error' : undefined}
                            className={inputClasses}
                            {...register('phone')}
                        />
                    </div>
                    {errors.phone && (
                        <p id="phone-error" className="text-sm text-danger">
                            {errors.phone.message}
                        </p>
                    )}
                </div>

                {/* Password */}
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
                            autoComplete="new-password"
                            placeholder="Create a strong password"
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

                {/* Confirm password */}
                <div className="space-y-1.5">
                    <label
                        htmlFor="confirmPassword"
                        className="block text-sm font-medium text-foreground"
                    >
                        Confirm password
                    </label>
                    <div className="relative">
                        <Lock
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <input
                            id="confirmPassword"
                            type={showConfirmPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            placeholder="Re-enter your password"
                            aria-invalid={Boolean(errors.confirmPassword)}
                            aria-describedby={
                                errors.confirmPassword ? 'confirmPassword-error' : undefined
                            }
                            className={cn(inputClasses, 'pr-10')}
                            {...register('confirmPassword')}
                        />
                        <button
                            type="button"
                            onClick={() => setShowConfirmPassword((prev) => !prev)}
                            aria-label={
                                showConfirmPassword ? 'Hide password' : 'Show password'
                            }
                            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {showConfirmPassword ? (
                                <EyeOff className="h-4 w-4" aria-hidden="true" />
                            ) : (
                                <Eye className="h-4 w-4" aria-hidden="true" />
                            )}
                        </button>
                    </div>
                    {errors.confirmPassword && (
                        <p id="confirmPassword-error" className="text-sm text-danger">
                            {errors.confirmPassword.message}
                        </p>
                    )}
                </div>

                {/* Accept terms */}
                <div className="space-y-1.5">
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-muted-foreground">
                        <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-invalid={Boolean(errors.acceptTerms)}
                            aria-describedby={errors.acceptTerms ? 'acceptTerms-error' : undefined}
                            {...register('acceptTerms')}
                        />
                        <span>
                            I agree to the{' '}
                            <Link
                                to="/terms"
                                className="font-medium text-primary transition-colors hover:text-primary-hover"
                            >
                                Terms of Service
                            </Link>{' '}
                            and{' '}
                            <Link
                                to="/privacy"
                                className="font-medium text-primary transition-colors hover:text-primary-hover"
                            >
                                Privacy Policy
                            </Link>
                            .
                        </span>
                    </label>
                    {errors.acceptTerms && (
                        <p id="acceptTerms-error" className="text-sm text-danger">
                            {errors.acceptTerms.message}
                        </p>
                    )}
                </div>

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
                            <LoadingSpinner
                                className="text-primary-foreground"
                                label="Creating account"
                            />
                            Creating account...
                        </>
                    ) : (
                        'Create account'
                    )}
                </button>
            </form>
        </AuthLayout>
    );
}
