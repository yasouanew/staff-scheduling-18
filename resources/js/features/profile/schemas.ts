import { z } from 'zod';

/**
 * Zod validation schemas for the Profile feature.
 *
 * These schemas are the single source of truth for form validation and are
 * shared by React Hook Form (`zodResolver`) and, via the inferred types, by the
 * data-mutation hooks — so the form and the network payload can never drift.
 */

/** Shared password policy applied to any new-password field. */
const strongPassword = z
    .string()
    .min(8, { message: 'Password must be at least 8 characters.' })
    .regex(/[a-z]/, { message: 'Include at least one lowercase letter.' })
    .regex(/[A-Z]/, { message: 'Include at least one uppercase letter.' })
    .regex(/[0-9]/, { message: 'Include at least one number.' })
    .regex(/[^A-Za-z0-9]/, { message: 'Include at least one special character.' });

/**
 * Validation for the profile information form (name + email).
 *
 * Mirrors `UpdateProfileRequest`: `name` is required, `email` must be a valid
 * lowercase email. The backend re-checks uniqueness (ignoring the current user)
 * and returns a 422 field error if the address is already taken.
 */
export const profileUpdateSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, { message: 'Your name is required.' })
        .max(255, { message: 'Name must be 255 characters or fewer.' }),
    email: z
        .string()
        .trim()
        .min(1, { message: 'Email is required.' })
        .email({ message: 'Please enter a valid email address.' })
        .max(255, { message: 'Email must be 255 characters or fewer.' })
        .transform((value) => value.toLowerCase()),
});

export type ProfileUpdateFormValues = z.infer<typeof profileUpdateSchema>;

/** Raw form input type (pre-transform) used by React Hook Form. */
export type ProfileUpdateFormInput = z.input<typeof profileUpdateSchema>;

/**
 * Validation for the password update form.
 *
 * Requires a new password that satisfies the shared policy and matches its
 * confirmation. No current-password field is collected; the authenticated
 * session is sufficient to change the password.
 */
export const passwordUpdateSchema = z
    .object({
        password: strongPassword,
        passwordConfirmation: z.string().min(1, { message: 'Please confirm your new password.' }),
    })
    .refine((values) => values.password === values.passwordConfirmation, {
        message: 'Passwords do not match.',
        path: ['passwordConfirmation'],
    });

export type PasswordUpdateFormValues = z.infer<typeof passwordUpdateSchema>;

/** Raw form input type (pre-transform) used by React Hook Form. */
export type PasswordUpdateFormInput = z.input<typeof passwordUpdateSchema>;
