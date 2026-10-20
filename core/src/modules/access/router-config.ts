/**
 * Access admin router configs (p107 ACC-001; mounted by the app in ACC-005).
 *
 * `createRouterWithActor` takes a FLAT config, so this returns three groups;
 * the app mounts them as one nested router:
 *
 * ```ts
 * const cfg = createAccessRouterConfig({ service, permissions, accessLink, sendAccessLink, getDb: () => privilegedDb });
 * access: createTRPCRouter({
 *   codes: createRouterWithActor(cfg.codes),       // access.codes.list|create|revoke|setMaxUses
 *   waitlist: createRouterWithActor(cfg.waitlist), // access.waitlist.list|approve|reject|resend
 *   settings: createRouterWithActor(cfg.settings), // access.settings.get|update
 * })
 * ```
 *
 * The tables are Connect-level (no org, no RLS) → routes are `crossOrg`; pass
 * `getDb` (privileged client) unless the handler `db` can reach them.
 *
 * PLATFORM STAFF ONLY. A permission is checked in the caller's own org, but these
 * tables are global to the Connect instance, so an org role holding the slug says
 * nothing about the right to mint codes for everyone. Every procedure therefore
 * also requires `actor.isSystemUser === true` (the core idiom, see
 * `organizations/router-config.ts`) and refuses anyone else with FORBIDDEN.
 * Use slugs no org role template grants — {@link RECOMMENDED_ACCESS_PERMISSIONS}
 * (`admin:access:*`; cadra-auth's seed hands Standard User every `*:create` /
 * `*:update` slug). Every slug must be non-empty: an empty one would make
 * `createRouterWithActor` fall back to a plain protected procedure.
 *
 * @module @jetdevs/core/access
 */
import { TRPCError } from '@trpc/server';

import {
  codeIdSchema,
  createCodeSchema,
  listCodesSchema,
  listWaitlistSchema,
  setMaxUsesSchema,
  updateSettingsSchema,
  waitlistIdSchema,
} from './schemas';
import {
  AccessCodeFormatError,
  AccessCodeTakenError,
  WaitlistStateError,
  type AccessDb,
  type AccessService,
} from './service';
import type { SendAccessLinkArgs } from './types';

/**
 * Permission slugs for the access admin routes. Recommended values:
 * {@link RECOMMENDED_ACCESS_PERMISSIONS}. Use slugs no org role template grants
 * (not `*:create` / `*:update`, which some seeds hand out wholesale).
 */
export interface AccessRouterPermissions {
  codeRead: string;
  codeCreate: string;
  codeRevoke: string;
  waitlistRead: string;
  waitlistDecide: string;
  settingsUpdate: string;
  /** Permission for `settings.get`. Default: `settingsUpdate`. */
  settingsRead?: string;
}

/** Recommended slugs: one per screen, in the `admin:` namespace, none an org role grants. */
export const RECOMMENDED_ACCESS_PERMISSIONS = {
  codeRead: 'admin:access:codes',
  codeCreate: 'admin:access:codes',
  codeRevoke: 'admin:access:codes',
  waitlistRead: 'admin:access:waitlist',
  waitlistDecide: 'admin:access:waitlist',
  settingsUpdate: 'admin:access:settings',
  settingsRead: 'admin:access:settings',
} as const satisfies Required<AccessRouterPermissions>;

export interface CreateAccessRouterConfigOptions {
  service: AccessService;
  permissions: AccessRouterPermissions;
  /** Build the access link from the raw token, e.g. `${OIDC_ISSUER}/waitlist/access?token=…`. */
  accessLink: (token: string) => string;
  /** App-owned mail (Mailgun template). Called after approve/resend commit-side data is written. */
  sendAccessLink: (args: SendAccessLinkArgs) => Promise<void>;
  /** DB for the access tables. Default: the handler's `db`. */
  getDb?: () => AccessDb;
  invalidationTags?: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx<TInput> = {
  input: TInput;
  db?: any;
  service?: { userId?: string };
  actor?: { isSystemUser?: boolean };
};

/** Platform staff only: the access tables are Connect-global, not org-scoped. */
function requireSystemUser(ctx: Ctx<unknown>): void {
  if (ctx.actor?.isSystemUser !== true) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Access admin is limited to platform staff' });
  }
}

/** Wrap every handler of a flat route group with the system-user check. */
function systemOnly<T extends Record<string, { handler: (ctx: any) => Promise<unknown> }>>(group: T): T {
  const out = {} as Record<string, unknown>;
  for (const [name, route] of Object.entries(group)) {
    const inner = route.handler;
    out[name] = {
      ...route,
      handler: async (ctx: Ctx<unknown>) => {
        requireSystemUser(ctx);
        return inner(ctx);
      },
    };
  }
  return out as T;
}

function assertPermissions(p: AccessRouterPermissions): void {
  const keys: Array<keyof AccessRouterPermissions> = [
    'codeRead',
    'codeCreate',
    'codeRevoke',
    'waitlistRead',
    'waitlistDecide',
    'settingsUpdate',
  ];
  if (p?.settingsRead !== undefined) keys.push('settingsRead');
  const bad = keys.filter((k) => typeof p?.[k] !== 'string' || p[k]!.trim() === '');
  if (bad.length > 0) {
    throw new Error(
      `createAccessRouterConfig: permission slug(s) ${bad.join(', ')} must be non-empty strings ` +
        `(an empty slug falls back to an unchecked protected procedure). ` +
        `Recommended: RECOMMENDED_ACCESS_PERMISSIONS.`,
    );
  }
}

function actorUserId(ctx: Ctx<unknown>): number | null {
  const n = Number.parseInt(ctx.service?.userId ?? '', 10);
  return Number.isFinite(n) ? n : null;
}

function toTrpc(error: unknown): never {
  if (error instanceof WaitlistStateError || error instanceof AccessCodeTakenError) {
    throw new TRPCError({ code: 'CONFLICT', message: error.message });
  }
  if (error instanceof AccessCodeFormatError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
  }
  throw error;
}

function notFound(what: string, id: number): never {
  throw new TRPCError({ code: 'NOT_FOUND', message: `${what} ${id} not found` });
}

export function createAccessRouterConfig(options: CreateAccessRouterConfigOptions) {
  const { service, permissions: p, accessLink, sendAccessLink } = options;
  assertPermissions(p);
  const tags = options.invalidationTags ?? ['access'];
  const dbOf = (ctx: Ctx<unknown>): AccessDb => (options.getDb ? options.getDb() : ctx.db);

  async function sendLink(entry: { email: string }, token: string, expiresAt: Date) {
    await sendAccessLink({ to: entry.email, link: accessLink(token), expiresAt });
  }

  const codes = {
    list: {
      type: 'query' as const,
      permission: p.codeRead,
      crossOrg: true,
      input: listCodesSchema,
      handler: async (ctx: Ctx<import('zod').infer<typeof listCodesSchema>>) =>
        service.listCodes(dbOf(ctx), ctx.input),
    },
    create: {
      permission: p.codeCreate,
      crossOrg: true,
      input: createCodeSchema,
      invalidates: tags,
      handler: async (ctx: Ctx<import('zod').infer<typeof createCodeSchema>>) => {
        try {
          return await service.createCode(dbOf(ctx), { ...ctx.input, createdBy: actorUserId(ctx) });
        } catch (error) {
          return toTrpc(error);
        }
      },
    },
    revoke: {
      permission: p.codeRevoke,
      crossOrg: true,
      input: codeIdSchema,
      invalidates: tags,
      handler: async (ctx: Ctx<{ id: number }>) =>
        (await service.revokeCode(dbOf(ctx), ctx.input.id)) ?? notFound('access code', ctx.input.id),
    },
    setMaxUses: {
      permission: p.codeCreate,
      crossOrg: true,
      input: setMaxUsesSchema,
      invalidates: tags,
      handler: async (ctx: Ctx<{ id: number; maxUses: number | null }>) =>
        (await service.setCodeMaxUses(dbOf(ctx), ctx.input.id, ctx.input.maxUses)) ??
        notFound('access code', ctx.input.id),
    },
  };

  const waitlist = {
    list: {
      type: 'query' as const,
      permission: p.waitlistRead,
      crossOrg: true,
      input: listWaitlistSchema,
      handler: async (ctx: Ctx<import('zod').infer<typeof listWaitlistSchema>>) =>
        service.listWaitlist(dbOf(ctx), ctx.input),
    },
    approve: {
      permission: p.waitlistDecide,
      crossOrg: true,
      input: waitlistIdSchema,
      invalidates: tags,
      handler: async (ctx: Ctx<{ id: number }>) => {
        try {
          const { entry, token, expiresAt } = await service.approve(dbOf(ctx), ctx.input.id, actorUserId(ctx));
          await sendLink(entry, token, expiresAt);
          return entry; // never the raw token
        } catch (error) {
          return toTrpc(error);
        }
      },
    },
    reject: {
      permission: p.waitlistDecide,
      crossOrg: true,
      input: waitlistIdSchema,
      invalidates: tags,
      handler: async (ctx: Ctx<{ id: number }>) => {
        try {
          return await service.reject(dbOf(ctx), ctx.input.id, actorUserId(ctx));
        } catch (error) {
          return toTrpc(error);
        }
      },
    },
    resend: {
      permission: p.waitlistDecide,
      crossOrg: true,
      input: waitlistIdSchema,
      invalidates: tags,
      handler: async (ctx: Ctx<{ id: number }>) => {
        try {
          const { entry, token, expiresAt } = await service.resend(dbOf(ctx), ctx.input.id);
          await sendLink(entry, token, expiresAt);
          return entry;
        } catch (error) {
          return toTrpc(error);
        }
      },
    },
  };

  const settings = {
    get: {
      type: 'query' as const,
      permission: p.settingsRead ?? p.settingsUpdate,
      crossOrg: true,
      handler: async (ctx: Ctx<undefined>) => service.getAppSettings(dbOf(ctx)),
    },
    update: {
      permission: p.settingsUpdate,
      crossOrg: true,
      input: updateSettingsSchema,
      invalidates: tags,
      handler: async (ctx: Ctx<import('zod').infer<typeof updateSettingsSchema>>) =>
        service.updateAppSettings(dbOf(ctx), ctx.input, actorUserId(ctx)),
    },
  };

  return { codes: systemOnly(codes), waitlist: systemOnly(waitlist), settings: systemOnly(settings) };
}
