/**
 * Auth Schemas
 *
 * Zod validation schemas for authentication operations.
 */

import { z } from 'zod';

// =============================================================================
// REGISTRATION
// =============================================================================

export const registerSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters long' }),
  name: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// =============================================================================
// LOGIN
// =============================================================================

export const loginSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

export type LoginInput = z.infer<typeof loginSchema>;

// =============================================================================
// PROFILE UPDATE
// =============================================================================

export const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// =============================================================================
// SESSION & SETTINGS
// =============================================================================

/**
 * Session timeout options in minutes
 * Values: 30min, 4hours, 1day, 7days
 */
export const sessionTimeoutOptions = [
  { value: 30, label: 'Sign out after 30 minutes of inactivity' },
  { value: 240, label: 'Sign out after 4 hours of inactivity' },
  { value: 1440, label: 'Keep me signed in for 1 day' },
  { value: 10080, label: 'Keep me signed in for 7 days' },
] as const;

/**
 * Valid session timeout values
 */
export const SESSION_TIMEOUT_VALUES = [30, 240, 1440, 10080] as const;
export type SessionTimeoutValue = (typeof SESSION_TIMEOUT_VALUES)[number];

/**
 * Session preference schema
 */
export const sessionPreferenceSchema = z.object({
  sessionTimeoutMinutes: z.number().refine(
    (val) => SESSION_TIMEOUT_VALUES.includes(val as SessionTimeoutValue),
    {
      message: "Invalid session timeout option"
    }
  )
});

export type SessionPreferenceInput = z.infer<typeof sessionPreferenceSchema>;

/**
 * User profile schema for settings page
 * More comprehensive than updateProfileSchema (used in auth router)
 */
export const userProfileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
});

export type UserProfileInput = z.infer<typeof userProfileSchema>;

/**
 * Change password schema with strong password requirements
 */
export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  confirmPassword: z
    .string()
    .min(1, "Please confirm your new password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "New passwords do not match",
  path: ["confirmPassword"],
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
