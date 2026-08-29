import { z } from 'zod';

/**
 * Shared password policy applied to any new-password field.
 * Enforces length plus lower/upper/number/symbol composition.
 */
const strongPassword = z
    .string()
    .min(8, { message: 'Password must be at least 8 characters.' })
    .regex(/[a-z]/, { message: 'Include at least one lowercase letter.' })
    .regex(/[A-Z]/, { message: 'Include at least one uppercase letter.' })
    .regex(/[0-9]/, { message: 'Include at least one number.' })
    .regex(/[^A-Za-z0-9]/, { message: 'Include at least one special character.' });

/** Login form schema. */
export const loginSchema = z.object({
    email: z
        .string()
        .min(1, { message: 'Email is required.' })
        .email({ message: 'Please enter a valid company email address.' }),
    password: z.string().min(1, { message: 'Password is required.' }),
    rememberMe: z.boolean().optional(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

/** Company sign-up (self-service trial) form schema. */
export const registerSchema = z
    .object({
        name: z
            .string()
            .min(1, { message: 'Your full name is required.' })
            .max(255, { message: 'Name must be 255 characters or fewer.' }),
        companyName: z
            .string()
            .min(1, { message: 'Company name is required.' })
            .max(255, { message: 'Company name must be 255 characters or fewer.' }),
        email: z
            .string()
            .min(1, { message: 'Email is required.' })
            .email({ message: 'Please enter a valid company email address.' }),
        phone: z
            .string()
            .max(30, { message: 'Phone number must be 30 characters or fewer.' })
            .optional()
            .or(z.literal('')),
        password: strongPassword,
        confirmPassword: z.string().min(1, { message: 'Please confirm your password.' }),
        acceptTerms: z.boolean().refine((value) => value, {
            message: 'You must accept the terms to continue.',
        }),
    })
    .refine((values) => values.password === values.confirmPassword, {
        message: 'Passwords do not match.',
        path: ['confirmPassword'],
    });

export type RegisterFormValues = z.infer<typeof registerSchema>;

/** Forgot-password form schema. */
export const forgotPasswordSchema = z.object({
    email: z
        .string()
        .min(1, { message: 'Email is required.' })
        .email({ message: 'Please enter a valid company email address.' }),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

/** Reset-password form schema with confirmation matching. */
export const resetPasswordSchema = z
    .object({
        password: strongPassword,
        confirmPassword: z.string().min(1, { message: 'Please confirm your password.' }),
    })
    .refine((values) => values.password === values.confirmPassword, {
        message: 'Passwords do not match.',
        path: ['confirmPassword'],
    });

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

/**
 * Confirm-password form schema.
 *
 * Used on the "confirm your password" screen that re-authenticates the user
 * before a sensitive action. This validates the *current* password, so no
 * strength rules apply — only presence.
 */
export const confirmPasswordSchema = z.object({
    password: z.string().min(1, { message: 'Please enter your password to continue.' }),
});

export type ConfirmPasswordFormValues = z.infer<typeof confirmPasswordSchema>;
