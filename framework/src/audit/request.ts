import { createHash, randomUUID } from 'node:crypto';
import type { AuditRequestMeta } from './types';

type HeaderSource = { get(name: string): string | null | undefined } | Record<string, string | string[] | undefined>;

function readHeader(h: HeaderSource, name: string): string | null {
  if (typeof (h as { get?: unknown }).get === 'function') {
    return (h as { get(n: string): string | null | undefined }).get(name) ?? null;
  }
  const rec = h as Record<string, string | string[] | undefined>;
  const v = rec[name] ?? rec[name.toLowerCase()];
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/**
 * Trace id precedence (from yobo `resolveTraceId`): x-request-id, then the
 * trace-id segment of W3C `traceparent`, else a fresh UUID.
 */
export function resolveRequestId(headers: HeaderSource): string {
  const rid = readHeader(headers, 'x-request-id')?.trim();
  if (rid) return rid;
  const parts = readHeader(headers, 'traceparent')?.split('-');
  if (parts && parts.length >= 2 && parts[1]) return parts[1];
  return randomUUID();
}

/**
 * Extract request metadata. IP is the first x-forwarded-for hop, else x-real-ip.
 * NOTE: these headers are caller-controlled unless a trusted proxy sets them;
 * treat as forensic metadata, never as an authorization input.
 */
export function auditRequestMeta(headers: HeaderSource): AuditRequestMeta {
  const xff = readHeader(headers, 'x-forwarded-for')?.split(',')[0]?.trim();
  return {
    ipAddress: xff || readHeader(headers, 'x-real-ip')?.trim() || null,
    userAgent: readHeader(headers, 'user-agent'),
    requestId: resolveRequestId(headers),
  };
}

/** Stable JSON (sorted keys) for hashing. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value instanceof Date ? value.toISOString() : value) ?? 'null';
}

/** Hash args instead of storing values (engage `mcp_audit.args_hash` pattern). */
export function hashAuditArgs(args: unknown): string {
  return createHash('sha256').update(canonicalJson(args)).digest('hex');
}
