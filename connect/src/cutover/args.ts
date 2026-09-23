/**
 * p77 STORY-005 — argument parsing and the guards that run BEFORE anything
 * connects (§5.3; p79's cutover-args carried over). Kept free of every
 * server import on purpose: a refused prod run must be refused by a process
 * that never opened a connection.
 *
 * Exit codes are cadra-web's: 0 zero remain / clean plan; 1 rows remain or
 * refusals; 2 refused before doing anything.
 *
 * Ported-From: cadra-web@b615864c:scripts/p79/cutover-args.ts
 */

import { isRpSystem, type RpSystem } from '../adapter/index.js'
import { CONNECT_ENVS, type ConnectEnv } from '../next-auth/internal-routes.js'

export class CutoverUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CutoverUsageError'
  }
}

/** A refusal: exit 2, nothing touched. The message names what to do. */
export class CutoverRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CutoverRefusedError'
  }
}

export interface EstateArgs {
  command: string | null
  env: ConnectEnv
  execute: boolean
  /** `--rp <system>=<origin>`, repeatable. */
  rps: Partial<Record<RpSystem, string>>
  manifestPath: string | null
  only: string[]
  reportPath: string | null
  allowlistPath: string | null
  abort: boolean
  minutes: number | null
  reason: string | null
  decisionsPath: string | null
  as: string | null
  note: string | null
  help: boolean
}

export const ESTATE_USAGE = `usage: pnpm connect:cutover [approve] --env local|dev|prod [options]
       pnpm connect:maintenance on|off|extend|status --env <env> [--reason <text>] [--abort] [--minutes <n>]
       pnpm connect:issuer:backfill --env <env> --rp <system>=<origin> [--dry-run|--execute]
       pnpm connect:emails:audit|reconcile --env <env> --rp <system>=<origin> [--decisions <file>] [--execute]

  --env <local|dev|prod>   REQUIRED. Checked against every host: loopback only for local, never loopback for dev/prod.
  --rp <system>=<origin>   an RP to drive (repeatable). An RP not given is refused rp_not_ready for every row.
  --dry-run                (default) writes nothing anywhere; needs no switch.
  --execute                needs the estate switch on and the per-env advisory lock. dev/prod also need CUTOVER_CONFIRM=<env>.
  --manifest <path>        the reviewed, approved manifest (required for --execute).
  --only <email[,email]>   act on these persons only (repeatable).
  --report <path>          JSON report path. Reports carry digests, never hashes.
  --allowlist <path>       the D18 deactivate allowlist.
  --abort                  (maintenance off) release every open handoff first; refused after the first activation.
  --minutes <n> --reason   (maintenance extend)
  --decisions <file>       (emails reconcile) the retirement decisions file.
  --as "<name>" [--note]   (approve) who approves.

exit codes: 0 zero remain / clean plan / lifted; 1 rows remain or refusals; 2 refused before doing anything.`

export function parseEstateArgs(argv: ReadonlyArray<string>): EstateArgs {
  const args: EstateArgs = { command: null, env: 'local', execute: false, rps: {}, manifestPath: null, only: [], reportPath: null, allowlistPath: null, abort: false, minutes: null, reason: null, decisionsPath: null, as: null, note: null, help: false }
  let envSeen = false
  let dryRunSeen = false
  const take = (flag: string, i: number): string => {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new CutoverUsageError(`${flag} needs a value`)
    return v
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!
    switch (a) {
      case '--help':
      case '-h':
        args.help = true
        break
      case '--env': {
        const v = take(a, i)
        i += 1
        if (!(CONNECT_ENVS as readonly string[]).includes(v)) throw new CutoverUsageError(`--env must be one of ${CONNECT_ENVS.join('|')}, got "${v}"`)
        args.env = v as ConnectEnv
        envSeen = true
        break
      }
      case '--execute':
        args.execute = true
        break
      case '--dry-run':
        dryRunSeen = true
        break
      case '--abort':
        args.abort = true
        break
      case '--rp': {
        const v = take(a, i)
        i += 1
        const eq = v.indexOf('=')
        const system = eq === -1 ? v : v.slice(0, eq)
        const origin = eq === -1 ? '' : v.slice(eq + 1)
        if (!isRpSystem(system) || !origin) throw new CutoverUsageError(`--rp must be <crm|yobo|commerce|superhost>=<origin>, got "${v}"`)
        args.rps[system] = origin
        break
      }
      case '--manifest':
        args.manifestPath = take(a, i)
        i += 1
        break
      case '--only': {
        const v = take(a, i)
        i += 1
        for (const e of v.split(',')) {
          const email = e.trim().toLowerCase()
          if (email && !args.only.includes(email)) args.only.push(email)
        }
        break
      }
      case '--report':
        args.reportPath = take(a, i)
        i += 1
        break
      case '--allowlist':
        args.allowlistPath = take(a, i)
        i += 1
        break
      case '--minutes': {
        const v = Number(take(a, i))
        i += 1
        if (!Number.isInteger(v) || v < 1 || v > 120) throw new CutoverUsageError('--minutes must be an integer between 1 and 120')
        args.minutes = v
        break
      }
      case '--reason':
        args.reason = take(a, i)
        i += 1
        break
      case '--decisions':
        args.decisionsPath = take(a, i)
        i += 1
        break
      case '--as':
        args.as = take(a, i)
        i += 1
        break
      case '--note':
        args.note = take(a, i)
        i += 1
        break
      default:
        if (a.startsWith('--')) throw new CutoverUsageError(`unknown argument "${a}"`)
        if (args.command !== null) throw new CutoverUsageError(`unexpected argument "${a}"`)
        args.command = a
    }
  }
  if (args.help) return args
  if (!envSeen) throw new CutoverUsageError('--env is required')
  if (args.execute && dryRunSeen) throw new CutoverUsageError('--dry-run and --execute are exclusive')
  return args
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function hostOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname || null
  } catch {
    return null
  }
}

export function isLoopbackUrl(url: string | undefined): boolean {
  const host = hostOf(url)
  return host !== null && LOOPBACK.has(host)
}

/** A printable label for a database URL: host and database name, never credentials. */
export function dbLabel(url: string | undefined): string {
  if (!url) return '(unset)'
  try {
    const u = new URL(url)
    return `${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`
  } catch {
    return '(unparseable)'
  }
}

/**
 * Everything that must be true before a single connection is opened. Throws
 * `CutoverRefusedError` (exit 2) with the fix in the message.
 *   - `--env local` refuses any non-loopback RP origin, issuer or database;
 *   - `--env dev|prod` refuses loopback hosts, and `--execute` needs `CUTOVER_CONFIRM=<env>`.
 */
export function assertEstateGuards(args: EstateArgs, env: Record<string, string | undefined>, opts: { issuer?: string; databaseUrls?: string[]; requireRps?: boolean } = {}): void {
  const issuer = opts.issuer ?? env.OIDC_ISSUER ?? env.CONNECT_ISSUER_URL
  const dbs = opts.databaseUrls ?? [env.DATABASE_URL].filter((x): x is string => !!x)
  const origins = Object.entries(args.rps)
  if (opts.requireRps && origins.length === 0) throw new CutoverRefusedError('no --rp <system>=<origin> given; nothing to drive')
  if (!issuer) throw new CutoverRefusedError('the Connect issuer is not configured (OIDC_ISSUER / CONNECT_ISSUER_URL)')

  if (args.env === 'local') {
    if (!isLoopbackUrl(issuer)) throw new CutoverRefusedError(`--env local but the issuer is ${hostOf(issuer) ?? issuer}, not loopback`)
    for (const [system, origin] of origins) if (!isLoopbackUrl(origin)) throw new CutoverRefusedError(`--env local but --rp ${system} points at ${hostOf(origin) ?? origin}, not loopback`)
    for (const db of dbs) if (!isLoopbackUrl(db)) throw new CutoverRefusedError(`--env local but a database URL points at ${dbLabel(db)}, not loopback`)
    return
  }
  if (args.execute && env.CUTOVER_CONFIRM !== args.env) {
    throw new CutoverRefusedError(`refusing --execute for ${args.env}: set CUTOVER_CONFIRM=${args.env} in the environment of this one command`)
  }
  if (isLoopbackUrl(issuer)) throw new CutoverRefusedError(`--env ${args.env} but the issuer is loopback; export the ${args.env} issuer`)
  for (const [system, origin] of origins) if (isLoopbackUrl(origin)) throw new CutoverRefusedError(`--env ${args.env} but --rp ${system} is loopback (${origin})`)
  for (const db of dbs) if (isLoopbackUrl(db)) throw new CutoverRefusedError(`--env ${args.env} but a database URL is loopback (${dbLabel(db)}); export the ${args.env} database URL`)
}
