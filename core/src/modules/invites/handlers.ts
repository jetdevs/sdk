/**
 * Invite route-handler factories (p131 INV-002, specs D1/D3, implementation.md
 * P5/P6/P7/P21/P22). Each IdP (every Connect instance) mounts these under
 * its own internal API and supplies `authorize` — the module never reads keys,
 * headers or env itself (I4).
 *
 *   POST /invites                       → create (supersedes an open invite)
 *   GET  /invites?orgRef=<sourceOrgRef> → list (caller-scoped, P21)
 *   POST /invites/:id/resend            → { sourceOrgRef } — new token, expiry restarted
 *   POST /invites/:id/cancel            → { sourceOrgRef }
 *   POST /invites/cancel-by-email       → D10 removal hook
 *
 * Order in every handler: authorize FIRST (no body read, no db touch before
 * it), then zod-validate, then call the service. The caller identity
 * (`clientId`, `sourceSystem`) comes only from `authorize`, never the body.
 * Responses never carry the raw token or its hash.
 */
import { InviteError, type InviteService } from './service';
import type { InviteDb } from './store';
import { cancelByEmailInputSchema, createInviteInputSchema } from './schemas';
import type { InviteCaller, PublicInvite } from './types';

/** `authorize` returns the authenticated caller, or a Response to send as-is (401/403). */
export type InviteAuthorize = (req: Request) => InviteCaller | Response | Promise<InviteCaller | Response>;

export interface CreateInviteHandlersOptions {
  service: InviteService;
  /** The IdP's admin db handle (or a getter, so it resolves lazily per request). */
  db: InviteDb | (() => InviteDb);
  authorize: InviteAuthorize;
  /** Optional error sink for unexpected failures (never receives a token). */
  onError?: (event: string, err: unknown) => void;
}

/** Next.js 15 passes `params` as a Promise; earlier shapes pass it plain. */
export interface InviteRouteContext {
  params: Promise<{ id: string }> | { id: string };
}

/** The wire shape of an invite in list responses (no token hash, no access-code id). */
export interface InviteWire {
  id: number;
  email: string;
  roleRef: string;
  roleName: string;
  status: PublicInvite['status'];
  invitedBySub: string;
  invitedByName: string | null;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  cancelledAt: string | null;
  provisionState: PublicInvite['provisionState'];
}

export function toInviteWire(i: PublicInvite): InviteWire {
  return {
    id: i.id,
    email: i.email,
    roleRef: i.roleRef,
    roleName: i.roleName,
    status: i.status,
    invitedBySub: i.invitedBySub,
    invitedByName: i.invitedByName,
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
    acceptedAt: i.acceptedAt ? i.acceptedAt.toISOString() : null,
    cancelledAt: i.cancelledAt ? i.cancelledAt.toISOString() : null,
    provisionState: i.provisionState,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const ERROR_STATUS: Record<InviteError['reason'], number> = {
  not_found: 404,
  org_not_found: 404,
  not_pending: 409,
  conflict: 409,
  not_acceptable: 409,
};

async function readJson(req: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false };
  }
}

/**
 * resend/cancel body: `{ sourceOrgRef }` (required, trimmed, 1..255). Scopes the
 * id to one org so a caller cannot act on another org's invite by id. A missing
 * or unparseable body is the same 400 as a missing field.
 */
async function readSourceOrgRef(req: Request): Promise<string | null> {
  const raw = await readJson(req);
  if (!raw.ok || !raw.body || typeof raw.body !== 'object') return null;
  const v = (raw.body as { sourceOrgRef?: unknown }).sourceOrgRef;
  if (typeof v !== 'string') return null;
  const ref = v.trim();
  return ref && ref.length <= 255 ? ref : null;
}

function parseId(raw: string | undefined): number | null {
  if (!raw || !/^[1-9]\d{0,15}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

export function createInviteHandlers(options: CreateInviteHandlersOptions) {
  const { service, authorize } = options;
  const getDb = (): InviteDb =>
    typeof options.db === 'function' ? (options.db as () => InviteDb)() : options.db;

  /** Runs authorize first; any non-caller result is returned untouched. */
  async function guard(
    req: Request,
    fn: (caller: InviteCaller) => Promise<Response>,
    event: string,
  ): Promise<Response> {
    let caller: InviteCaller | Response;
    try {
      caller = await authorize(req);
    } catch (err) {
      options.onError?.(`${event}.authorize`, err);
      return json({ error: 'unauthorized' }, 401);
    }
    if (caller instanceof Response) return caller;
    if (!caller || !caller.clientId || !caller.sourceSystem) return json({ error: 'unauthorized' }, 401);
    try {
      return await fn(caller);
    } catch (err) {
      if (err instanceof InviteError) return json({ error: err.reason }, ERROR_STATUS[err.reason] ?? 400);
      options.onError?.(event, err);
      return json({ error: 'internal_error' }, 500);
    }
  }

  async function idFrom(ctx: InviteRouteContext | undefined): Promise<number | null> {
    const params = ctx ? await ctx.params : undefined;
    return parseId(params?.id);
  }

  /** POST /invites — body per P5/P6/P7; response { id, status, expiresAt, connectOrgId, emailSent, superseded }. */
  function create(req: Request): Promise<Response> {
    return guard(
      req,
      async (caller) => {
        const raw = await readJson(req);
        if (!raw.ok) return json({ error: 'invalid_json' }, 400);
        const parsed = createInviteInputSchema.safeParse(raw.body);
        if (!parsed.success) return json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
        const r = await service.create(getDb(), caller, parsed.data);
        return json(
          {
            id: r.invite.id,
            status: r.invite.status,
            expiresAt: r.invite.expiresAt.toISOString(),
            connectOrgId: r.connectOrgId,
            emailSent: r.emailSent,
            superseded: r.superseded,
          },
          r.superseded ? 200 : 201,
        );
      },
      'invites.create',
    );
  }

  /** GET /invites?orgRef= — only the caller's source system + client (P21). */
  function list(req: Request): Promise<Response> {
    return guard(
      req,
      async (caller) => {
        const orgRef = new URL(req.url).searchParams.get('orgRef')?.trim() ?? '';
        if (!orgRef || orgRef.length > 255) return json({ error: 'invalid_query', field: 'orgRef' }, 400);
        const invites = await service.list(getDb(), caller, orgRef);
        return json({ invites: invites.map(toInviteWire) });
      },
      'invites.list',
    );
  }

  /** POST /invites/:id/resend — body { sourceOrgRef } (required; org scope). */
  function resend(req: Request, ctx?: InviteRouteContext): Promise<Response> {
    return guard(
      req,
      async (caller) => {
        const id = await idFrom(ctx);
        if (id === null) return json({ error: 'invalid_id' }, 400);
        const sourceOrgRef = await readSourceOrgRef(req);
        if (sourceOrgRef === null) return json({ error: 'invalid_body', field: 'sourceOrgRef' }, 400);
        const r = await service.resend(getDb(), caller, id, sourceOrgRef);
        return json({
          id: r.invite.id,
          status: r.invite.status,
          expiresAt: r.invite.expiresAt.toISOString(),
          emailSent: r.emailSent,
        });
      },
      'invites.resend',
    );
  }

  /** POST /invites/:id/cancel — body { sourceOrgRef } (required; org scope). */
  function cancel(req: Request, ctx?: InviteRouteContext): Promise<Response> {
    return guard(
      req,
      async (caller) => {
        const id = await idFrom(ctx);
        if (id === null) return json({ error: 'invalid_id' }, 400);
        const sourceOrgRef = await readSourceOrgRef(req);
        if (sourceOrgRef === null) return json({ error: 'invalid_body', field: 'sourceOrgRef' }, 400);
        const inv = await service.cancel(getDb(), caller, id, sourceOrgRef);
        return json({ id: inv.id, status: inv.status });
      },
      'invites.cancel',
    );
  }

  /** POST /invites/cancel-by-email — { sourceOrgRef, email } → { cancelled: 0|1 } */
  function cancelByEmail(req: Request): Promise<Response> {
    return guard(
      req,
      async (caller) => {
        const raw = await readJson(req);
        if (!raw.ok) return json({ error: 'invalid_json' }, 400);
        const parsed = cancelByEmailInputSchema.safeParse(raw.body);
        if (!parsed.success) return json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
        const r = await service.cancelByEmail(getDb(), caller, parsed.data);
        return json(r);
      },
      'invites.cancelByEmail',
    );
  }

  return { create, list, resend, cancel, cancelByEmail };
}

export type InviteHandlers = ReturnType<typeof createInviteHandlers>;
