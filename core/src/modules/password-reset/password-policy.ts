/**
 * Password policy shared by the reset flow's client and server.
 *
 * The client renders these rules as a live checklist while the user types; the
 * server re-validates with the same list. Keep them in one place so the two can
 * never disagree — a rule the UI shows as passing but the API rejects is the
 * classic way a reset form becomes unusable.
 */

export interface PasswordRule {
  /** Stable key — apps map it to their own i18n message. */
  key: string;
  /** English fallback, used when an app has no translation for the key. */
  message: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    key: 'ruleMinLength',
    message: 'Password must be at least 8 characters',
    test: (pw) => pw.length >= 8,
  },
  {
    key: 'ruleUppercase',
    message: 'Password must contain at least one uppercase letter',
    test: (pw) => /[A-Z]/.test(pw),
  },
  {
    key: 'ruleLowercase',
    message: 'Password must contain at least one lowercase letter',
    test: (pw) => /[a-z]/.test(pw),
  },
  {
    key: 'ruleNumber',
    message: 'Password must contain at least one number',
    test: (pw) => /[0-9]/.test(pw),
  },
  {
    key: 'ruleSpecialChar',
    message: 'Password must contain at least one special character',
    test: (pw) => /[^A-Za-z0-9]/.test(pw),
  },
] as const;

export interface PasswordPolicyResult {
  valid: boolean;
  /** First failing rule, or null when the password passes. */
  failed: PasswordRule | null;
}

/** Validate a password against every rule, returning the first failure. */
export function validatePassword(password: string): PasswordPolicyResult {
  const failed = PASSWORD_RULES.find((rule) => !rule.test(password)) ?? null;
  return { valid: failed === null, failed };
}

/** Per-rule pass/fail, for rendering a live checklist. */
export function evaluatePasswordRules(
  password: string,
): Array<PasswordRule & { passed: boolean }> {
  return PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(password) }));
}
