import type { ErrorEntry, ErrorEntryDef } from '../types';
import { AUTH } from './auth';
import { BILLING } from './billing';
import { COMMON } from './common';
import { REMIX } from './remix';
import { VIDEO } from './video';
import { ADS } from './ads';
import { AGENT } from './agent';
import { CAMPAIGN } from './campaign';
import { COMMERCE } from './commerce';
import { CONNECTOR } from './connector';
import { MESSAGING } from './messaging';
import { ONBOARDING } from './onboarding';

/** Every domain file, merged. A new domain is one new file + one line here. */
const DEFS = { ...COMMON, ...AUTH, ...BILLING, ...VIDEO, ...REMIX, ...AGENT, ...CAMPAIGN, ...MESSAGING, ...CONNECTOR, ...COMMERCE, ...ONBOARDING, ...ADS } as const;

/** Every catalog code, as a type: `raise('billing.credits_short')` is checked at compile time. */
export type ErrorCode = keyof typeof DEFS;

function build(defs: Readonly<Record<string, ErrorEntryDef>>): Readonly<Record<string, ErrorEntry>> {
  const out: Record<string, ErrorEntry> = {};
  for (const [code, def] of Object.entries(defs)) {
    out[code] = Object.freeze({ ...def, code, copyKey: `error.${code}` });
  }
  return Object.freeze(out);
}

/** The one error catalog. Read-only. */
export const ERROR_CATALOG: Readonly<Record<ErrorCode, ErrorEntry>> = build(DEFS) as Readonly<Record<ErrorCode, ErrorEntry>>;

/** Fallback (English) labels for forward buttons; managed copy key is `error.forward.<key>`. ≤ 20 chars (WhatsApp). */
export const FORWARD_FALLBACK_LABELS = {
  try_again: 'Try again',
  top_up: 'Top up credits',
  upgrade: 'Upgrade',
  change: 'Change more',
  pick_other: 'Pick a ready ad',
  sign_in: 'Sign in',
  connect: 'Connect',
  open_app: 'Open the app',
  contact_support: 'Get help',
} as const;
