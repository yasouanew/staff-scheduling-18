import * as Dialog from '@radix-ui/react-dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { Globe, Smartphone, X } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
    DEFAULT_EMPLOYEE_ROLE,
    EMPLOYEE_ROLE_DESCRIPTIONS,
    EMPLOYEE_ROLE_LABELS,
    EMPLOYEE_ROLES,
    type Employee,
    type EmployeeRole,
    type InvitationChannel,
    type SendInvitationInput,
} from '@/types/employee';

import { useSendInvitation } from '../hooks/useEmployees';

interface SendInviteModalProps {
    /** Employee being invited, or `null` when the dialog is closed. */
    employee: Employee | null;
    /** Notifies the parent to clear the selection / close the dialog. */
    onOpenChange: (open: boolean) => void;
}

/** Validation schema mirroring {@link SendInvitationInput}. */
const sendInviteSchema = z.object({
    role: z.enum(['company_admin', 'scheduler', 'employee']),
    email: z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.'),
});

type SendInviteFormValues = z.infer<typeof sendInviteSchema>;

/** Shared field styling, matching the other employee dialogs. */
const fieldClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

/**
 * Which onboarding journey a role receives.
 *
 * Mirrors the backend rule exactly (`employee` → mobile, everyone else → web) so
 * the preview shown before sending is always what actually gets emailed.
 */
function resolveChannel(role: EmployeeRole): InvitationChannel {
    return role === 'employee' ? 'mobile' : 'web';
}

/**
 * Explains, step by step, what the invitee will experience — so an admin knows
 * exactly what they are about to send before they send it.
 */
function ChannelPreview({ channel }: { channel: InvitationChannel }): JSX.Element {
    const steps =
        channel === 'web'
            ? [
                'Receives an email with a secure "Set up your account" link.',
                'Opens the link in their browser and chooses a password.',
                'Is signed in to this dashboard automatically.',
            ]
            : [
                'Receives an email with a link to download the mobile app.',
                'Opens the app and enters this email address.',
                'Gets a 6-digit verification code by email and enters it.',
                'Chooses a password and lands straight in the app.',
            ];

    const Icon = channel === 'web' ? Globe : Smartphone;

    return (
        <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Icon aria-hidden="true" className="size-4 text-primary" />
                {channel === 'web' ? 'Web dashboard onboarding' : 'Mobile app onboarding'}
            </p>
            <ol className="space-y-1.5 text-sm text-muted-foreground">
                {steps.map((step, index) => (
                    <li key={step} className="flex gap-2">
                        <span
                            aria-hidden="true"
                            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-card text-xs font-semibold text-foreground"
                        >
                            {index + 1}
                        </span>
                        <span>{step}</span>
                    </li>
                ))}
            </ol>
        </div>
    );
}

/**
 * Dialog for sending (or re-sending) an onboarding invitation, opened from the
 * team table's three-dot row menu.
 *
 * The role select doubles as the channel switch: company admins and schedulers
 * are emailed a link into this web app to set a password, while employees are
 * emailed a link to download the mobile app and verify with a code. The dialog
 * previews the chosen journey so the outcome is never a surprise.
 */
export function SendInviteModal({ employee, onOpenChange }: SendInviteModalProps): JSX.Element {
    const sendInvitation = useSendInvitation();

    const {
        register,
        handleSubmit,
        reset,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<SendInviteFormValues>({
        resolver: zodResolver(sendInviteSchema),
        defaultValues: { role: DEFAULT_EMPLOYEE_ROLE, email: '' },
    });

    const selectedRole = watch('role');
    const channel = resolveChannel(selectedRole);

    /*
     * Pre-fill from the selected row: re-sending should default to whatever the
     * person was last invited as, falling back to their current account role and
     * finally to the least-privileged option for someone never invited.
     */
    useEffect(() => {
        if (!employee) return;

        reset({
            role: employee.invitation?.role ?? employee.role ?? DEFAULT_EMPLOYEE_ROLE,
            email: employee.invitation?.email ?? employee.email ?? '',
        });
    }, [employee?.id, reset]); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = handleSubmit(async (values) => {
        if (!employee) return;

        const payload: SendInvitationInput = values;

        try {
            const result = await sendInvitation.mutateAsync({
                employeeId: employee.id,
                input: payload,
            });

            toast.success('Invitation sent', {
                description:
                    result.channel === 'web'
                        ? `${result.email} was emailed a link to set their password and sign in.`
                        : `${result.email} was emailed a link to download the app and verify by code.`,
            });
            onOpenChange(false);
        } catch (error) {
            toast.error('Unable to send invitation', {
                description: getApiErrorMessage(error, 'Something went wrong. Please try again.'),
            });
        }
    });

    const isResend = employee?.invitation != null;

    return (
        <Dialog.Root open={employee !== null} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                <Dialog.Content
                    className={cn(
                        'fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col',
                        'rounded-xl border border-border bg-card shadow-xl focus:outline-none',
                        'data-[state=open]:animate-in data-[state=closed]:animate-out',
                        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
                        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
                    )}
                >
                    {/* Header */}
                    <div className="flex items-start justify-between border-b border-border p-6">
                        <div className="space-y-1">
                            <Dialog.Title className="text-lg font-semibold tracking-tight text-foreground">
                                {isResend ? 'Resend invitation' : 'Send invitation'}
                            </Dialog.Title>
                            <Dialog.Description className="text-sm text-muted-foreground">
                                Email {employee?.name ?? 'this employee'} everything they need to set up
                                their account.
                            </Dialog.Description>
                        </div>
                        <Dialog.Close
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="Close"
                        >
                            <X className="h-5 w-5" aria-hidden="true" />
                        </Dialog.Close>
                    </div>

                    {/* Body */}
                    <form onSubmit={submit} noValidate className="flex flex-1 flex-col overflow-y-auto">
                        <div className="flex-1 space-y-5 p-6">
                            {/* Email */}
                            <div className="space-y-1.5">
                                <label
                                    htmlFor="invite-email"
                                    className="block text-sm font-medium text-foreground"
                                >
                                    Send to
                                </label>
                                <input
                                    id="invite-email"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="name@company.com.au"
                                    aria-invalid={Boolean(errors.email)}
                                    className={fieldClasses}
                                    {...register('email')}
                                />
                                {errors.email ? (
                                    <p className="text-sm text-danger">{errors.email.message}</p>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        This also becomes their sign-in address.
                                    </p>
                                )}
                            </div>

                            {/* Role — also decides which onboarding journey is emailed */}
                            <div className="space-y-1.5">
                                <label
                                    htmlFor="invite-role"
                                    className="block text-sm font-medium text-foreground"
                                >
                                    Access level
                                </label>
                                <select
                                    id="invite-role"
                                    aria-describedby="invite-role-description"
                                    className={fieldClasses}
                                    {...register('role')}
                                >
                                    {EMPLOYEE_ROLES.map((option) => (
                                        <option key={option} value={option}>
                                            {EMPLOYEE_ROLE_LABELS[option]}
                                        </option>
                                    ))}
                                </select>
                                <p id="invite-role-description" className="text-sm text-muted-foreground">
                                    {EMPLOYEE_ROLE_DESCRIPTIONS[selectedRole]}
                                </p>
                            </div>

                            {/* What the invitee will actually experience */}
                            <ChannelPreview channel={channel} />

                            {isResend && (
                                <p className="text-sm text-muted-foreground">
                                    Sending again replaces any earlier link or code, so previous emails
                                    will stop working.
                                </p>
                            )}
                        </div>

                        {/* Footer actions */}
                        <div className="flex items-center justify-end gap-3 border-t border-border p-6">
                            <Dialog.Close asChild>
                                <button
                                    type="button"
                                    className={cn(
                                        'inline-flex h-11 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors',
                                        'hover:bg-secondary hover:text-secondary-foreground',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    )}
                                >
                                    Cancel
                                </button>
                            </Dialog.Close>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className={cn(
                                    'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors',
                                    'hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                                    'disabled:cursor-not-allowed disabled:opacity-70',
                                )}
                            >
                                {isSubmitting ? (
                                    <>
                                        <LoadingSpinner
                                            className="text-primary-foreground"
                                            label="Sending"
                                        />
                                        Sending...
                                    </>
                                ) : isResend ? (
                                    'Resend invitation'
                                ) : (
                                    'Send invitation'
                                )}
                            </button>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
