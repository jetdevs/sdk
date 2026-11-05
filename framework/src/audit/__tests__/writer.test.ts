import { describe, expect, it } from 'vitest';
import {
  AuditPiiError,
  auditRequestMeta,
  createAuditWriter,
  type OrgAuditRow,
  type PlatformAuditRow,
} from '../index';

function setup() {
  const org: OrgAuditRow[] = [];
  const platform: PlatformAuditRow[] = [];
  const writer = createAuditWriter({
    orgSink: async (row) => { org.push(row); },
    platformSink: async (row) => { platform.push(row); },
  });
  return { org, platform, writer };
}

describe('AuditWriter', () => {
  it('writes an org event with orgId, actor kind and request meta', async () => {
    const { org, platform, writer } = setup();
    await writer.write({
      scope: 'org',
      orgId: 7,
      action: 'CREATE',
      entityType: 'campaign',
      entityId: '42',
      actor: { kind: 'api_key', apiKeyId: 3 },
      request: auditRequestMeta({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8', 'user-agent': 'ua', 'x-request-id': 'r1' }),
    });
    expect(platform).toHaveLength(0);
    expect(org).toHaveLength(1);
    expect(org[0]).toMatchObject({ orgId: 7, entityId: '42', ipAddress: '1.2.3.4', requestId: 'r1', userAgent: 'ua' });
    expect(org[0]?.metadata).toMatchObject({ actor: { kind: 'api_key', id: '3' } });
  });

  it('writes a platform event without any org', async () => {
    const { org, platform, writer } = setup();
    await writer.write({
      scope: 'platform',
      action: 'AUDIT_EXPORTED',
      entityType: 'audit',
      actor: { kind: 'user', userId: 1 },
      severity: 'WARN',
    });
    expect(org).toHaveLength(0);
    expect(platform).toHaveLength(1);
    expect(platform[0]).toMatchObject({ orgId: null, userId: 1, resource: 'audit' });
    expect(platform[0]?.details).toMatchObject({ actor: { kind: 'user', id: '1' }, severity: 'WARN' });
  });

  it('refuses events carrying a never-log PII field (nested too) and writes nothing', async () => {
    const { org, writer } = setup();
    const p = writer.write({
      scope: 'org',
      orgId: 7,
      action: 'UPDATE',
      entityType: 'customer',
      actor: { kind: 'system' },
      changes: { after: { name: 'x', contact: { Email: 'a@b.c' } } },
    });
    await expect(p).rejects.toBeInstanceOf(AuditPiiError);
    await expect(p).rejects.toMatchObject({ fields: ['after.contact.Email'] });
    expect(org).toHaveLength(0);
  });
});
