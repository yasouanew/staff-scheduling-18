import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Building2, Check, Eye, EyeOff, Lock, Mail, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { resetPasswordSchema, type ResetPasswordFormValues } from '@/features/auth/schemas';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { EMPLOYEE_ROLE_LABELS } from '@/types/employee';

import { useAcceptInvitation, useInvitationPreview } from '../hooks/useInvitation';

/** A single password requirement shown in the live checklist. */
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

const inputClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background pl-10 pr-10 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

/**
 * Public "set up your account" screen for invited company admins and schedulers.
 *
 * Reached from the emailed invitation link, which carries the one-time token and
 * the invited email address. The address is never editable here — it is bound to
 * the invitation — so the person can only ever activate the account they were
 * actually invited to.
 */
export default function AcceptInvitationPage(): JSX.Element {
    const [params] = useSearchParams();
    const navigate = useNavigate();

    const token = params.get('token') ?? '';
    const email = params.get('email') ?? '';

    const preview = useInvitationPreview({ token, email });
    const acceptInvitation = useAcceptInvitation();

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

    const satisfiedCount = useMemo(
        () => REQUIREMENTS.filter((requirement) => requirement.test(passwordValue)).length,
        [passwordValue],
    );

    const submit = handleSubmit(async (values) => {
        try {
            await acceptInvitation.mutateAsync({
                token,
                email,
                password: values.password,
                passwordConfirmation: values.confirmPassword,
            });

            toast.success('Your account is ready', {
                description: 'Sign in with your new password to get started.',
            });
            // No session is issued by design, so the new password is used straight away.
            navigate('/login', { replace: true });
        } catch (error) {
            toast.error('Unable to set your password', {
                description: getApiErrorMessage(
                    error,
                    'This invitation may have expired. Ask your administrator to send a new one.',
                ),
            });
        }
    });

    /* -------------------------------------------------------------------- */
    /* Guard states: the link itself must be valid before showing the form  */
    /* -------------------------------------------------------------------- */

    if (token === '' || email === '') {
        return (
            <AuthLayout
                title="Invitation link incomplete"
                subtitle="This link is missing information we need to verify your invitation."
                footer={
                    <Link
                        to="/login"
                        className="font-medium text-primary transition-colors hover:text-primary-hover"
                    >
                        Go to sign in
                    </Link>
                }
            >
                <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/40 p-6 text-center">
                    <span className="flex size-11 items-center justify-center rounded-full bg-warning/10 text-warning">
                        <AlertTriangle aria-hidden="true" className="size-5" />
                    </span>
                    <p className="text-sm text-muted-foreground">
                        Please open the invitation link directly from your email, or ask your
                        administrator to send it again.
                    </p>
                </div>
            </AuthLayout>
        );
    }

    if (preview.isLoading) {
        return (
            <AuthLayout title="Checking your invitation" subtitle="This will only take a moment.">
                <div className="flex items-center justify-center gap-3 py-10 text-sm text-muted-foreground">
                    <LoadingSpinner label="Checking invitation" />
                    Verifying your invitation link...
                </div>
            </AuthLayout>
        );
    }

    if (preview.isError) {
        return (
            <AuthLayout
                title="This invitation is no longer valid"
                subtitle="The link may have already been used, or it has expired."
                footer={
                    <Link
                        to="/login"
                        className="font-medium text-primary transition-colors hover:text-primary-hover"
                    >
                        Go to sign in
                    </Link>
                }
            >
                <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/40 p-6 text-center">
                    <span className="flex size-11 items-center justify-center rounded-full bg-danger/10 text-danger">
                        <AlertTriangle aria-hidden="true" className="size-5" />
                    </span>
                    <p className="text-sm text-muted-foreground">
                        {getApiErrorMessage(
                            preview.error,
                            'Ask your administrator to send you a fresh invitation.',
                        )}
                    </p>
                </div>
            </AuthLayout>
        );
    }

    const invitation = preview.data;

    return (
        <AuthLayout
            title={
                invitation?.name ? `Welcome, ${invitation.name.split(' ')[0]}` : 'Set up your account'
            }
            subtitle="Choose a password to activate your account and sign in."
            footer={
                <Link
                    to="/login"
                    className="font-medium text-primary transition-colors hover:text-primary-hover"
                >
                    Already set up? Sign in
                </Link>
            }
        >
            {/* Invitation context: who invited them, as what, and to which address. */}
            <div className="mb-6 space-y-2 rounded-lg border border-border bg-muted/40 p-4">
                {invitation?.companyName ? (
                    <p className="flex items-center gap-2 text-sm text-foreground">
                        <Building2 aria-hidden="true" className="size-4 text-primary" />
                        <span className="font-medium">{invitation.companyName}</span>
                        {invitation.role ? (
                            <span className="text-muted-foreground">
                                &middot; {EMPLOYEE_ROLE_LABELS[invitation.role]}
                            </span>
                        ) : null}
                    </p>
                ) : null}
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail aria-hidden="true" className="size-4" />
                    {invitation?.email ?? email}
                </p>
            </div>

            <form onSubmit={submit} noValidate className="space-y-5">
                {/* New password */}
                <div className="space-y-1.5">
                    <label htmlFor="password" className="block text-sm font-medium text-foreground">
                        Create password
                    </label>
                    <div className="relative">
                        <Lock
                            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            placeholder="Create a password"
                            aria-invalid={Boolean(errors.password)}
                            aria-describedby="password-requirements"
                            className={inputClasses}
                            {...register('password')}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {showPassword ? (
                                <EyeOff className="size-4" aria-hidden="true" />
                            ) : (
                                <Eye className="size-4" aria-hidden="true" />
                            )}
                        </button>
                    </div>

                    {/* Live requirement checklist keeps the rules visible while typing. */}
                    {passwordValue.length > 0 && (
                        <ul id="password-requirements" className="grid gap-1 pt-1">
                            {REQUIREMENTS.map((requirement) => {
                                const passed = requirement.test(passwordValue);

                                return (
                                    <li
                                        key={requirement.label}
                                        className={cn(
                                            'flex items-center gap-1.5 text-xs transition-colors',
                                            passed ? 'text-success' : 'text-muted-foreground',
                                        )}
                                    >
                                        {passed ? (
                                            <Check className="size-3.5" aria-hidden="true" />
                                        ) : (
                                            <X className="size-3.5" aria-hidden="true" />
                                        )}
                                        {requirement.label}
                                    </li>
                                );
                            })}
                        </ul>
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
                            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <input
                            id="confirmPassword"
                            type={showConfirm ? 'text' : 'password'}
                            autoComplete="new-password"
                            placeholder="Re-enter your password"
                            aria-invalid={Boolean(errors.confirmPassword)}
                            className={inputClasses}
                            {...register('confirmPassword')}
                        />
                        <button
                            type="button"
                            onClick={() => setShowConfirm((prev) => !prev)}
                            aria-label={showConfirm ? 'Hide password' : 'Show password'}
                            className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {showConfirm ? (
                                <EyeOff className="size-4" aria-hidden="true" />
                            ) : (
                                <Eye className="size-4" aria-hidden="true" />
                            )}
                        </button>
                    </div>
                    {errors.confirmPassword && (
                        <p className="text-sm text-danger">{errors.confirmPassword.message}</p>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={isSubmitting || satisfiedCount < REQUIREMENTS.length}
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
                                label="Activating account"
                            />
                            Setting up...
                        </>
                    ) : (
                        'Activate my account'
                    )}
                </button>
            </form>
        </AuthLayout>
    );
}
