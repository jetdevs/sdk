import type { ErrorEntryDef } from '../types';

/** E3000-E3099: agent errors (draft, filled per adoption-yobo.md). */
export const AGENT = {
} as const satisfies Record<string, ErrorEntryDef>;
