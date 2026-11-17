import { describe, expect, it } from 'vitest';
import { ERROR_CATALOG, FORWARD_FALLBACK_LABELS } from '../catalog';
import type { ErrorEntry } from '../types';

const entries = Object.values(ERROR_CATALOG) as ErrorEntry[];

/** Ref blocks per domain (spec § Ref blocks). */
const BLOCKS: Record<string, [number, number]> = {
  common: [1000, 1099],
  auth: [1100, 1199],
  billing: [1200, 1299],
  video: [2000, 2099],
  remix: [2100, 2199],
  agent: [3000, 3099],
  campaign: [3100, 3199],
  messaging: [3200, 3299],
  connector: [3300, 3399],
  commerce: [3400, 3499],
  onboarding: [3500, 3599],
  ads: [3600, 3699],
};

describe('error catalog rules', () => {
  it('has entries', () => {
    expect(entries.length).toBeGreaterThan(30);
  });

  it.each(entries.map((e) => [e.code, e] as const))('%s: code, ref and block are well formed', (_c, e) => {
    expect(e.code).toMatch(/^[a-z]+\.[a-z_]+$/);
    expect(e.ref).toMatch(/^E\d{4}$/);
    const domain = e.code.split('.')[0]!;
    const block = BLOCKS[domain];
    expect(block, `no ref block for domain ${domain}`).toBeDefined();
    const n = Number(e.ref.slice(1));
    expect(n).toBeGreaterThanOrEqual(block![0]);
    expect(n).toBeLessThanOrEqual(block![1]);
    expect(e.copyKey).toBe(`error.${e.code}`);
  });

  it('refs are unique (a ref is never reused)', () => {
    const refs = entries.map((e) => e.ref);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it.each(entries.map((e) => [e.code, e] as const))('%s: try_again only when retryable (D3)', (_c, e) => {
    if (e.kind !== 'retryable') expect(e.forward).not.toContain('try_again');
  });

  it.each(entries.map((e) => [e.code, e] as const))('%s: forward set is legal', (_c, e) => {
    expect(e.forward.length).toBeLessThanOrEqual(3);
    expect(new Set(e.forward).size).toBe(e.forward.length);
    for (const k of e.forward) expect(Object.keys(FORWARD_FALLBACK_LABELS)).toContain(k);
    if (e.kind === 'needs_merchant') expect(e.forward.length).toBeGreaterThanOrEqual(1);
    if (e.kind === 'internal') {
      expect(e.forward).toEqual([]);
      expect(e.agent.retry).toBe(false);
    }
  });

  it.each(entries.map((e) => [e.code, e] as const))('%s: a non-null ask comes with buttons (p152 G3b/G4)', (_c, e) => {
    if (e.agent.ask !== null) expect(e.forward.length).toBeGreaterThanOrEqual(1);
  });

  it.each(entries.map((e) => [e.code, e] as const))('%s: agent hint is present and compact', (_c, e) => {
    expect(e.agent.reason.trim()).not.toBe('');
    expect(e.agent.fix.trim()).not.toBe('');
    expect(e.agent.reason.length + e.agent.fix.length + (e.agent.ask?.length ?? 0)).toBeLessThanOrEqual(300);
    if (e.kind !== 'retryable') expect(e.agent.retry).toBe(false);
    if (e.agent.retry) expect(e.kind).toBe('retryable');
    // the agent cannot wait: code owns any backoff (agents-lead-5)
    expect(e.agent.fix).not.toMatch(/\bwait\b/i);
    // internal kind makes no promise that someone is looking (no alert fires from the catalog)
    if (e.kind === 'internal') expect(`${e.fallback} ${e.agent.fix}`).not.toMatch(/looking at it|been told/i);
  });

  it.each(entries.map((e) => [e.code, e] as const))('%s: fallback is one plain sentence block with no placeholder', (_c, e) => {
    expect(e.fallback.trim()).not.toBe('');
    expect(e.fallback).not.toMatch(/\{[a-zA-Z0-9_]+\}/);
    expect(e.fallback.length).toBeLessThanOrEqual(160);
  });

  it('forward fallback labels fit a WhatsApp button (20 chars)', () => {
    for (const label of Object.values(FORWARD_FALLBACK_LABELS)) expect(label.length).toBeLessThanOrEqual(20);
  });
});
