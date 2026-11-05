/** Procedure-name helpers ported from yobo `org-audit.ts` (action inference, entity id/name extraction). */

const ACTION_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^softDelete/i, 'SOFT_DELETE'], [/^archive/i, 'SOFT_DELETE'],
  [/^bulk.*create/i, 'BULK_CREATE'], [/^bulk.*update/i, 'BULK_UPDATE'], [/^bulk.*delete/i, 'BULK_DELETE'], [/^batch/i, 'BULK_UPDATE'],
  [/^(create|add|register|insert|new)/i, 'CREATE'],
  [/^(update|edit|modify|change|set|save|rename)/i, 'UPDATE'],
  [/^(delete|remove|destroy)/i, 'DELETE'],
  [/^(restore|unarchive)/i, 'RESTORE'],
  [/^(activate|enable)/i, 'ACTIVATE'], [/^(deactivate|disable)/i, 'DEACTIVATE'],
  [/^import/i, 'IMPORT'], [/^export/i, 'EXPORT'],
  [/^(execute|run|trigger)/i, 'EXECUTE'], [/^send/i, 'SEND'],
  [/^unpublish/i, 'UNPUBLISH'], [/^publish/i, 'PUBLISH'],
  [/^(duplicate|copy|clone)/i, 'DUPLICATE'],
  [/^unassign/i, 'UNASSIGN'], [/^assign/i, 'ASSIGN'],
  [/^sync/i, 'SYNC'], [/^generate/i, 'GENERATE'], [/^(verify|validate)/i, 'VERIFY'],
  [/^revoke/i, 'REVOKE'], [/^reset/i, 'RESET'], [/^(configure|setup)/i, 'CONFIGURE'],
];

/** 'createCampaign' -> 'CREATE'. Falls back to 'UPDATE' (yobo default). */
export function inferAuditAction(procedureName: string): string {
  for (const [re, action] of ACTION_PATTERNS) if (re.test(procedureName)) return action;
  return 'UPDATE';
}

type Obj = Record<string, unknown>;

/** Pass the already-sanitised input. `idFields` default mirrors yobo. */
export function extractAuditEntityId(
  input: Obj | null,
  result: unknown,
  idFields: readonly string[] = ['id', 'uuid'],
): string | null {
  const pick = (o: Obj): string | null => {
    for (const f of idFields) if (o[f] !== undefined && o[f] !== null) return String(o[f]);
    return null;
  };
  return (input && pick(input)) || (result && typeof result === 'object' ? pick(result as Obj) : null);
}

export function extractAuditEntityName(
  input: Obj | null,
  result: unknown,
  nameFields: readonly string[] = ['name', 'title', 'label'],
): string | null {
  const pick = (o: Obj): string | null => {
    for (const f of nameFields) if (typeof o[f] === 'string' && o[f]) return o[f] as string;
    return null;
  };
  return (result && typeof result === 'object' ? pick(result as Obj) : null) || (input && pick(input)) || null;
}
