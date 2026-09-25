/**
 * p85 S0 / CAD-190 — per-command (split) RLS policies.
 *
 * (a) With `policies` set, generateOrgPolicies emits one policy per command for
 *     app_user, each with only the clauses Postgres accepts for that command,
 *     plus the unchanged `${t}_internal_policy`.
 * (b) Without `policies`, the output is byte-identical to develop's. The
 *     expected literals below were captured from develop (core 0.1.40-dev,
 *     before this change) for the cadra-web `skills` and `tools` configs.
 */

import { describe, it, expect } from 'vitest';
import { generateOrgPolicies, generateCreatePolicySQL, generatePoliciesForIsolation, generateWorkspacePolicies } from '../policies';
import { validateTableConfig } from '../registry';
import type { RlsTableConfig } from '../types';
import type { PolicyTemplate } from '../deploy-types';

const SUPER = "current_setting('app.is_superuser', true) = 'true'";

// cadra-web scripts/core/rls-registry.ts `skills` entry on develop (no customPolicy)
const skillsConfig: RlsTableConfig = {
  isolation: 'org',
  orgId: true,
  workspaceId: false,
  description: 'Reusable skill templates with prompt templating and RAG linkage',
  rlsEnabled: true,
};

// cadra-web scripts/core/rls-registry.ts `tools` entry on develop (customPolicy, pre-split)
const toolsCustomPolicyConfig: RlsTableConfig = {
  isolation: 'org',
  orgId: true,
  workspaceId: false,
  description: 'External tool integrations (REST API, MCP, Webhook). Supports global tools (is_global=true, org_id=null) accessible to all orgs.',
  rlsEnabled: true,
  customPolicy: `(
      current_setting('app.is_superuser', true) = 'true'
      OR org_id = get_current_org_id()
      OR (org_id IS NULL AND is_global = true AND is_enabled = true)
    )`,
};

// The p85 `tools` entry: readable globally, writable only by own org / superuser.
const TOOLS_SELECT = `(
      current_setting('app.is_superuser', true) = 'true'
      OR org_id = get_current_org_id()
      OR (org_id IS NULL AND is_global = true AND is_enabled = true)
    )`;
const TOOLS_WRITE = `(${SUPER} OR org_id = get_current_org_id())`;
const toolsSplitConfig: RlsTableConfig = {
  isolation: 'org',
  orgId: true,
  workspaceId: false,
  description: 'tools with split policies',
  rlsEnabled: true,
  policies: {
    select: TOOLS_SELECT,
    insert: TOOLS_WRITE,
    update: TOOLS_WRITE,
    delete: TOOLS_WRITE,
  },
};

describe('generateOrgPolicies with `policies` (split per command)', () => {
  const templates = generateOrgPolicies('tools', toolsSplitConfig);
  const byName = Object.fromEntries(templates.map((t) => [t.name, t])) as Record<string, PolicyTemplate>;

  it('returns exactly five templates in order: select, insert, update, delete, internal', () => {
    expect(templates.map((t) => t.name)).toEqual([
      'tools_select',
      'tools_insert',
      'tools_update',
      'tools_delete',
      'tools_internal_policy',
    ]);
  });

  it('tools_select is FOR SELECT TO app_user with USING only', () => {
    expect(byName.tools_select).toEqual({
      name: 'tools_select',
      cmd: 'SELECT',
      role: 'app_user',
      using: TOOLS_SELECT.trim(),
    });
    expect(byName.tools_select!.withCheck).toBeUndefined();
  });

  it('tools_insert is FOR INSERT TO app_user with WITH CHECK only', () => {
    expect(byName.tools_insert).toEqual({
      name: 'tools_insert',
      cmd: 'INSERT',
      role: 'app_user',
      withCheck: TOOLS_WRITE,
    });
    expect(byName.tools_insert!.using).toBeUndefined();
  });

  it('tools_update is FOR UPDATE TO app_user with USING and WITH CHECK', () => {
    expect(byName.tools_update).toEqual({
      name: 'tools_update',
      cmd: 'UPDATE',
      role: 'app_user',
      using: TOOLS_WRITE,
      withCheck: TOOLS_WRITE,
    });
  });

  it('tools_delete is FOR DELETE TO app_user with USING only', () => {
    expect(byName.tools_delete).toEqual({
      name: 'tools_delete',
      cmd: 'DELETE',
      role: 'app_user',
      using: TOOLS_WRITE,
    });
    expect(byName.tools_delete!.withCheck).toBeUndefined();
  });

  it('the internal policy is unchanged (FOR ALL TO internal_api_user, no clauses)', () => {
    const [, internalBefore] = generateOrgPolicies('tools', toolsCustomPolicyConfig);
    expect(byName.tools_internal_policy).toEqual(internalBefore);
    expect(byName.tools_internal_policy).toEqual({
      name: 'tools_internal_policy',
      cmd: 'ALL',
      role: 'internal_api_user',
      using: undefined,
    });
  });

  it('a missing key falls back to generatePolicyCondition (customPolicy, else org_id check)', () => {
    const partialCustom: RlsTableConfig = {
      ...toolsCustomPolicyConfig,
      policies: { insert: TOOLS_WRITE },
    };
    const t = generateOrgPolicies('tools', partialCustom);
    expect(t.find((p) => p.name === 'tools_select')!.using).toBe(TOOLS_SELECT.trim());
    expect(t.find((p) => p.name === 'tools_insert')!.withCheck).toBe(TOOLS_WRITE);
    expect(t.find((p) => p.name === 'tools_update')!.using).toBe(TOOLS_SELECT.trim());
    expect(t.find((p) => p.name === 'tools_delete')!.using).toBe(TOOLS_SELECT.trim());

    const partialDefault: RlsTableConfig = { ...skillsConfig, policies: { delete: `(${SUPER})` } };
    const s = generateOrgPolicies('skills', partialDefault);
    const orgCond = `(${SUPER} OR (org_id = get_current_org_id()))`;
    expect(s.find((p) => p.name === 'skills_select')!.using).toBe(orgCond);
    expect(s.find((p) => p.name === 'skills_insert')!.withCheck).toBe(orgCond);
    expect(s.find((p) => p.name === 'skills_update')!.withCheck).toBe(orgCond);
    expect(s.find((p) => p.name === 'skills_delete')!.using).toBe(`(${SUPER})`);
  });

  it('generateCreatePolicySQL never puts USING on INSERT or WITH CHECK on SELECT/DELETE', () => {
    for (const p of templates) {
      const sql = generateCreatePolicySQL('tools', p);
      const hasUsing = /\n  USING \(/.test(sql);
      const hasWithCheck = /\n  WITH CHECK \(/.test(sql);
      switch (p.cmd) {
        case 'SELECT':
        case 'DELETE':
          expect(hasUsing, `${p.name} needs USING`).toBe(true);
          expect(hasWithCheck, `${p.name} must not have WITH CHECK`).toBe(false);
          break;
        case 'INSERT':
          expect(hasUsing, `${p.name} must not have USING`).toBe(false);
          expect(hasWithCheck, `${p.name} needs WITH CHECK`).toBe(true);
          break;
        case 'UPDATE':
          expect(hasUsing).toBe(true);
          expect(hasWithCheck).toBe(true);
          break;
        case 'ALL':
          // internal policy: no clauses at all
          expect(hasUsing).toBe(false);
          expect(hasWithCheck).toBe(false);
          break;
      }
    }
  });

  it('emits the exact CREATE POLICY SQL for the split tools config', () => {
    const sql = templates.map((p) => generateCreatePolicySQL('tools', p)).join('\n');
    expect(sql).toBe(
      `CREATE POLICY "tools_select" ON "tools"\n  FOR SELECT\n  TO "app_user"\n  USING (${TOOLS_SELECT.trim()});\n` +
      `CREATE POLICY "tools_insert" ON "tools"\n  FOR INSERT\n  TO "app_user"\n  WITH CHECK (${TOOLS_WRITE});\n` +
      `CREATE POLICY "tools_update" ON "tools"\n  FOR UPDATE\n  TO "app_user"\n  USING (${TOOLS_WRITE})\n  WITH CHECK (${TOOLS_WRITE});\n` +
      `CREATE POLICY "tools_delete" ON "tools"\n  FOR DELETE\n  TO "app_user"\n  USING (${TOOLS_WRITE});\n` +
      `CREATE POLICY "tools_internal_policy" ON "tools"\n  FOR ALL\n  TO "internal_api_user";`
    );
  });

  it('generatePoliciesForIsolation routes org tables with `policies` to the split generator', () => {
    expect(generatePoliciesForIsolation('tools', toolsSplitConfig)).toEqual(templates);
  });

  it('`policies` is ignored for workspace isolation and flagged by validateTableConfig', () => {
    const ws: RlsTableConfig = {
      isolation: 'workspace',
      orgId: true,
      workspaceId: true,
      description: 'ws',
      policies: { select: 'true' },
    };
    const wsTemplates = generateWorkspacePolicies('t', ws);
    expect(wsTemplates.map((p) => p.name)).toEqual(['t_workspace_policy', 't_internal_policy']);
    expect(generatePoliciesForIsolation('t', ws)).toEqual(wsTemplates);

    const result = validateTableConfig('t', ws, {});
    expect(result.isValid).toBe(true);
    expect(result.warnings.some((w) => w.includes('per-command policies'))).toBe(true);

    // and NOT flagged for org isolation
    expect(validateTableConfig('tools', toolsSplitConfig, {}).warnings).toEqual([]);
  });
});

describe('generateOrgPolicies without `policies` is byte-identical to develop', () => {
  // Literals captured from develop (core 0.1.40-dev) before the split-policy change.
  const SKILLS_BEFORE_TEMPLATES = [
    {
      name: 'skills_org_policy',
      cmd: 'ALL',
      role: 'app_user',
      using: "(current_setting('app.is_superuser', true) = 'true' OR (org_id = get_current_org_id()))",
      withCheck: "(current_setting('app.is_superuser', true) = 'true' OR (org_id = get_current_org_id()))",
    },
    {
      name: 'skills_internal_policy',
      cmd: 'ALL',
      role: 'internal_api_user',
      using: undefined,
    },
  ];
  const SKILLS_BEFORE_SQL =
    'CREATE POLICY "skills_org_policy" ON "skills"\n  FOR ALL\n  TO "app_user"\n  USING ((current_setting(\'app.is_superuser\', true) = \'true\' OR (org_id = get_current_org_id())))\n  WITH CHECK ((current_setting(\'app.is_superuser\', true) = \'true\' OR (org_id = get_current_org_id())));\n' +
    'CREATE POLICY "skills_internal_policy" ON "skills"\n  FOR ALL\n  TO "internal_api_user";';

  const TOOLS_BEFORE_TEMPLATES = [
    {
      name: 'tools_org_policy',
      cmd: 'ALL',
      role: 'app_user',
      using: "(\n      current_setting('app.is_superuser', true) = 'true'\n      OR org_id = get_current_org_id()\n      OR (org_id IS NULL AND is_global = true AND is_enabled = true)\n    )",
      withCheck: "(\n      current_setting('app.is_superuser', true) = 'true'\n      OR org_id = get_current_org_id()\n      OR (org_id IS NULL AND is_global = true AND is_enabled = true)\n    )",
    },
    {
      name: 'tools_internal_policy',
      cmd: 'ALL',
      role: 'internal_api_user',
      using: undefined,
    },
  ];
  const TOOLS_BEFORE_SQL =
    'CREATE POLICY "tools_org_policy" ON "tools"\n  FOR ALL\n  TO "app_user"\n  USING ((\n      current_setting(\'app.is_superuser\', true) = \'true\'\n      OR org_id = get_current_org_id()\n      OR (org_id IS NULL AND is_global = true AND is_enabled = true)\n    ))\n  WITH CHECK ((\n      current_setting(\'app.is_superuser\', true) = \'true\'\n      OR org_id = get_current_org_id()\n      OR (org_id IS NULL AND is_global = true AND is_enabled = true)\n    ));\n' +
    'CREATE POLICY "tools_internal_policy" ON "tools"\n  FOR ALL\n  TO "internal_api_user";';

  it('skills (default org condition): templates and SQL unchanged', () => {
    const t = generateOrgPolicies('skills', skillsConfig);
    expect(t).toEqual(SKILLS_BEFORE_TEMPLATES);
    expect(t.map((p) => generateCreatePolicySQL('skills', p)).join('\n')).toBe(SKILLS_BEFORE_SQL);
  });

  it('tools (customPolicy): templates and SQL unchanged', () => {
    const t = generateOrgPolicies('tools', toolsCustomPolicyConfig);
    expect(t).toEqual(TOOLS_BEFORE_TEMPLATES);
    expect(t.map((p) => generateCreatePolicySQL('tools', p)).join('\n')).toBe(TOOLS_BEFORE_SQL);
  });

  it('JSON serialisation of the templates is byte-identical too', () => {
    expect(JSON.stringify(generateOrgPolicies('skills', skillsConfig))).toBe(JSON.stringify(SKILLS_BEFORE_TEMPLATES));
    expect(JSON.stringify(generateOrgPolicies('tools', toolsCustomPolicyConfig))).toBe(JSON.stringify(TOOLS_BEFORE_TEMPLATES));
  });
});
