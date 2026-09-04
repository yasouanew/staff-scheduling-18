import { zodResolver } from '@hookform/resolvers/zod';
import { BadgeCheck, CircleUserRound, KeyRound, MailWarning } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/Components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/Components/ui/card';
import { Field, FieldDescription, FieldError, Label } from '@/Components/ui/form-field';
import { Input } from '@/Components/ui/input';
import { getApiErrorMessage } from '@/lib/api-client';
import { useWebSession } from '@/features/auth/hooks/useWebSession';

import {
    getProfileFieldError,
    useUpdatePassword,
    useUpdateProfile,
} from '../hooks/useProfile';
import {
    passwordUpdateSchema,
    profileUpdateSchema,
    type PasswordUpdateFormInput,
    type PasswordUpdateFormValues,
    type ProfileUpdateFormInput,
    type ProfileUpdateFormValues,
} from '../schemas';

/**
 * Profile settings page (`/profile`).
 *
 * Lets the authenticated user update their name and email (with inline
 * verification status) and change their password. Persistence flows through
 * {@link useUpdateProfile} / {@link useUpdatePassword}; server-side validation
 * errors are surfaced inline next to the offending field via
 * {@link getProfileFieldError}.
 */
export function ProfilePage(): JSX.Element {
    const session = useWebSession();
    const updateProfile = useUpdateProfile();
    const updatePassword = useUpdatePassword();
    const [showPassword, setShowPassword] = useState(false);

    const user = session.data;

    const profileForm = useForm<ProfileUpdateFormInput, unknown, ProfileUpdateFormValues>({
        resolver: zodResolver(profileUpdateSchema),
        defaultValues: { name: '', email: '' },
    });

    const passwordForm = useForm<PasswordUpdateFormInput, unknown, PasswordUpdateFormValues>({
        resolver: zodResolver(passwordUpdateSchema),
        defaultValues: { password: '', passwordConfirmation: '' },
    });

    // Re-seed the profile form whenever the session user loads or changes.
    useEffect(() => {
        if (user) {
            profileForm.reset({ name: user.name, email: user.email });
        }
        // Only re-seed on session identity changes, not every keystroke.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, user?.name, user?.email]);

    const handleProfileSubmit = profileForm.handleSubmit(async (values) => {
        try {
            await updateProfile.mutateAsync({ name: values.name, email: values.email });
            toast.success('Profile updated', {
                description: 'Your name and email have been saved.',
            });
        } catch (error) {
            toast.error('Unable to update profile', {
                description: getApiErrorMessage(error, 'Please review the form and try again.'),
            });
        }
    });

    const handlePasswordSubmit = passwordForm.handleSubmit(async (values) => {
        try {
            await updatePassword.mutateAsync({
                password: values.password,
                passwordConfirmation: values.passwordConfirmation,
            });
            toast.success('Password updated', {
                description: 'Your password has been changed.',
            });
            passwordForm.reset();
        } catch (error) {
            const passwordError = getProfileFieldError(error, 'password');
            const confirmationError = getProfileFieldError(error, 'password_confirmation');

            if (passwordError) {
                passwordForm.setError('password', { type: 'server', message: passwordError });
            }
            if (confirmationError) {
                passwordForm.setError('passwordConfirmation', { type: 'server', message: confirmationError });
            }
            if (!passwordError && !confirmationError) {
                toast.error('Unable to update password', {
                    description: getApiErrorMessage(error, 'Please try again.'),
                });
            }
        }
    });

    const emailVerified = Boolean(user?.email_verified_at);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CircleUserRound className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="space-y-0.5">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        Profile
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Manage your personal details and password.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Profile information */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            Profile information
                            {emailVerified ? (
                                <span
                                    className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                                    title="Your email is verified"
                                >
                                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                    Verified
                                </span>
                            ) : null}
                        </CardTitle>
                        <CardDescription>
                            Your name and email are shown across the workspace.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form
                            onSubmit={handleProfileSubmit}
                            noValidate
                            className="space-y-4"
                            aria-label="Update profile information"
                        >
                            <Field>
                                <Label htmlFor="profile-name">Name</Label>
                                <Input
                                    id="profile-name"
                                    autoComplete="name"
                                    placeholder="Your full name"
                                    aria-invalid={Boolean(profileForm.formState.errors.name)}
                                    hasError={Boolean(profileForm.formState.errors.name)}
                                    disabled={updateProfile.isPending}
                                    {...profileForm.register('name')}
                                />
                                {profileForm.formState.errors.name ? (
                                    <FieldError>{profileForm.formState.errors.name.message}</FieldError>
                                ) : null}
                            </Field>

                            <Field>
                                <Label htmlFor="profile-email">Email</Label>
                                <Input
                                    id="profile-email"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="you@example.com"
                                    aria-invalid={Boolean(profileForm.formState.errors.email)}
                                    hasError={Boolean(profileForm.formState.errors.email)}
                                    disabled={updateProfile.isPending}
                                    {...profileForm.register('email')}
                                />
                                {profileForm.formState.errors.email ? (
                                    <FieldError>{profileForm.formState.errors.email.message}</FieldError>
                                ) : null}
                                {!emailVerified ? (
                                    <FieldDescription className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                                        <MailWarning className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                        Your email is not yet verified.
                                    </FieldDescription>
                                ) : null}
                            </Field>

                            <div className="flex justify-end">
                                <Button
                                    type="submit"
                                    loading={updateProfile.isPending}
                                    loadingLabel="Saving…"
                                >
                                    Save changes
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                {/* Password */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <KeyRound className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                            Update password
                        </CardTitle>
                        <CardDescription>
                            Use at least 8 characters with a mix of letters, numbers and symbols.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form
                            onSubmit={handlePasswordSubmit}
                            noValidate
                            className="space-y-4"
                            aria-label="Update password"
                        >
                            <Field>
                                <Label htmlFor="profile-new-password">New password</Label>
                                <Input
                                    id="profile-new-password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    placeholder="Enter a new password"
                                    aria-invalid={Boolean(passwordForm.formState.errors.password)}
                                    hasError={Boolean(passwordForm.formState.errors.password)}
                                    disabled={updatePassword.isPending}
                                    {...passwordForm.register('password')}
                                />
                                {passwordForm.formState.errors.password ? (
                                    <FieldError>
                                        {passwordForm.formState.errors.password.message}
                                    </FieldError>
                                ) : null}
                            </Field>

                            <Field>
                                <Label htmlFor="profile-confirm-password">Confirm new password</Label>
                                <Input
                                    id="profile-confirm-password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    placeholder="Re-enter your new password"
                                    aria-invalid={Boolean(passwordForm.formState.errors.passwordConfirmation)}
                                    hasError={Boolean(passwordForm.formState.errors.passwordConfirmation)}
                                    disabled={updatePassword.isPending}
                                    {...passwordForm.register('passwordConfirmation')}
                                />
                                {passwordForm.formState.errors.passwordConfirmation ? (
                                    <FieldError>
                                        {passwordForm.formState.errors.passwordConfirmation.message}
                                    </FieldError>
                                ) : null}
                            </Field>

                            <div className="flex items-center justify-between gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((previous) => !previous)}
                                    className="text-sm font-medium text-primary transition-colors hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    {showPassword ? 'Hide passwords' : 'Show passwords'}
                                </button>
                                <Button
                                    type="submit"
                                    loading={updatePassword.isPending}
                                    loadingLabel="Updating…"
                                >
                                    Update password
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default ProfilePage;
