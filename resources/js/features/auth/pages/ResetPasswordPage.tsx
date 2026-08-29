import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Eye, EyeOff, Lock, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { cn } from '@/lib/utils';

import { AuthLayout } from '../components/AuthLayout';
import { resetPasswordSchema, type ResetPasswordFormValues } from '../schemas';

interface ResetPasswordPageProps {
    /**
     * Submit handler wired by a container/route. Presentational page holds
     * no API logic; it awaits this callback and reflects loading state.
     */
    onSubmit?: (values: ResetPasswordFormValues) => Promise<void> | void;
}

/** A single password requirement definition. */
interface Requirement {
    label: string;
    test: (value: string) => boolean;
}

const REQUIREMENTS: ReadonlyArray<Requirement> = [
    { label: 'At least 8 characters', test: (v) => v.length >= 8 },
    { label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
    { label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
    { label: 'One number', test: (v) => /[0-9]/.test(v) },
    { label: 'One special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

/** Strength tiers mapped to a label plus a semantic bar colour. */
const STRENGTH_TIERS: ReadonlyArray<{ label: string; barClass: string; textClass: string }> = [
    { label: 'Very weak', barClass: 'bg-danger', textClass: 'text-danger' },
    { label: 'Weak', barClass: 'bg-danger', textClass: 'text-danger' },
    { label: 'Fair', barClass: 'bg-warning', textClass: 'text-warning' },
    { label: 'Good', barClass: 'bg-info', textClass: 'text-info' },
    { label: 'Strong', barClass: 'bg-success', textClass: 'text-success' },
];

const inputClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background pl-10 pr-10 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

export function ResetPasswordPage({ onSubmit }: ResetPasswordPageProps): JSX.Element {
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<ResetPasswordFormValues>({
        resolver: zodResolver(resetPasswordSchema),
        mode: 'onChange',
        defaultValues: { password: '', confirmPassword: '' },
    });

    const passwordValue = watch('password');

    // Derive how many requirements are satisfied for the strength meter.
    const satisfiedCount = useMemo(
        () => REQUIREMENTS.filter((requirement) => requirement.test(passwordValue)).length,
        [passwordValue],
    );

    const strength = STRENGTH_TIERS[Math.max(0, satisfiedCount - 1)] ?? STRENGTH_TIERS[0];
    const strengthPercent = (satisfiedCount / REQUIREMENTS.length) * 100;

    const submit = handleSubmit(async (values) => {
        await onSubmit?.(values);
    });

    return (
        <AuthLayout
            title="Set a new password"
            subtitle="Choose a strong password to secure your account."
            footer={
                <Link
                    to="/login"
                    className="font-medium text-primary transition-colors hover:text-primary-hover"
                >
                    Return to sign in
                </Link>
            }
        >
            <form onSubmit={submit} noValidate className="space-y-5">
                {/* New password */}
                <div className="space-y-1.5">
                    <label htmlFor="password" className="block text-sm font-medium text-foreground">
                        New password
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
                            placeholder="Enter a new password"
                            aria-invalid={Boolean(errors.password)}
                            aria-describedby="password-requirements"
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

                    {/* Strength meter */}
                    {passwordValue.length > 0 && (
                        <div className="space-y-2 pt-1">
                            <div className="flex items-center justify-between">
                                <div
                                    className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                                    role="progressbar"
                                    aria-valuenow={satisfiedCount}
                                    aria-valuemin={0}
                                    aria-valuemax={REQUIREMENTS.length}
                                >
                                    <div
                                        className={cn(
                                            'h-full rounded-full transition-all duration-300',
                                            strength.barClass,
                                        )}
                                        style={{ width: `${strengthPercent}%` }}
                                    />
                                </div>
                                <span
                                    className={cn(
                                        'ml-3 shrink-0 text-xs font-medium',
                                        strength.textClass,
                                    )}
                                >
                                    {strength.label}
                                </span>
                            </div>

                            <ul id="password-requirements" className="grid gap-1">
                                {REQUIREMENTS.map((requirement) => {
                                    const passed = requirement.test(passwordValue);

                                    return (
                                        <li
                                            key={requirement.label}
                                            className={cn(
                                                'flex items-center gap-1.5 text-xs transition-colors',
                                                passed
                                                    ? 'text-success'
                                                    : 'text-muted-foreground',
                                            )}
                                        >
                                            {passed ? (
                                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                            ) : (
                                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                                            )}
                                            {requirement.label}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}

                    {errors.password && (
                        <p className="text-sm text-danger">{errors.password.message}</p>
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
                            type={showConfirm ? 'text' : 'password'}
                            autoComplete="new-password"
                            placeholder="Re-enter your password"
                            aria-invalid={Boolean(errors.confirmPassword)}
                            aria-describedby={
                                errors.confirmPassword ? 'confirm-error' : undefined
                            }
                            className={inputClasses}
                            {...register('confirmPassword')}
                        />
                        <button
                            type="button"
                            onClick={() => setShowConfirm((prev) => !prev)}
                            aria-label={showConfirm ? 'Hide password' : 'Show password'}
                            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {showConfirm ? (
                                <EyeOff className="h-4 w-4" aria-hidden="true" />
                            ) : (
                                <Eye className="h-4 w-4" aria-hidden="true" />
                            )}
                        </button>
                    </div>
                    {errors.confirmPassword && (
                        <p id="confirm-error" className="text-sm text-danger">
                            {errors.confirmPassword.message}
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
                                label="Updating password"
                            />
                            Updating...
                        </>
                    ) : (
                        'Reset password'
                    )}
                </button>
            </form>
        </AuthLayout>
    );
}
