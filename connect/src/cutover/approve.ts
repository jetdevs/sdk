/**
 * p77 STORY-005 — the approval step, a SEPARATE program on purpose (§6.3;
 * p79's §7.3 gate). Prints what a reviewer must see — the counts, every
 * quarantined row with its reasons, every person's election — then signs
 * the rows. Re-running after an edit is the supported way to re-approve,
 * and it is a deliberate act by a named person, not a flag on the driver.
 *
 * Ported-From: cadra-auth@4bf4f62:scripts/approve-migration-manifest.ts
 */

import { approveManifest, computeManifestDigest, type EstateManifest } from './manifest.js'

export interface ApprovalReview {
  lines: string[]
  quarantined: EstateManifest['rows']
  deactivations: EstateManifest['rows']
}

/** What `pnpm connect:cutover approve` prints before it signs. */
export function reviewManifest(manifest: EstateManifest): ApprovalReview {
  const lines: string[] = []
  lines.push(`manifest generated ${manifest.generatedAt}  env ${manifest.env}  issuer ${manifest.connectIssuer}`)
  lines.push(`  rps        ${manifest.rps.join(', ')}`)
  const c = manifest.counts
  lines.push(`  import ${c.import}  retire ${c.retire}  adopt ${c.adopt}  recover ${c.recover}  linked ${c.linked}  quarantine ${c.quarantine}  system ${c.system}  deactivate ${c.deactivate}`)
  lines.push(`  digest     ${computeManifestDigest({ ...manifest, approval: null })}`)
  const elected = manifest.persons.filter((p) => p.canonicalSource)
  if (elected.length > 0) {
    lines.push('')
    lines.push(`ELECTED canonical sources (D10) — ${elected.length}:`)
    for (const p of elected) lines.push(`  ${p.email}  ← ${p.canonicalSource}`)
  }
  const quarantined = manifest.rows.filter((r) => r.class === 'quarantine')
  if (quarantined.length > 0) {
    lines.push('')
    lines.push('QUARANTINE — resolved by hand, never driven:')
    for (const r of quarantined) lines.push(`  ${r.system}:${r.sourceUserRef} ${r.email ?? '(no email)'}  ${r.reasons.join(', ')}`)
  }
  const deactivations = manifest.rows.filter((r) => r.deactivate)
  if (deactivations.length > 0) {
    lines.push('')
    lines.push('DEACTIVATE (D18 allowlist) — deactivated first, never fenced:')
    for (const r of deactivations) lines.push(`  ${r.system}:${r.sourceUserRef} ${r.email ?? '(no email)'}`)
  }
  return { lines, quarantined, deactivations }
}

export function approveWithReview(manifest: EstateManifest, input: { approvedBy: string; note?: string; approvedAt?: string }): { manifest: EstateManifest; lines: string[] } {
  const review = reviewManifest(manifest)
  const approved = approveManifest(manifest, input)
  const lines = [...review.lines, '', `approved by ${approved.approval!.approvedBy} at ${approved.approval!.approvedAt}`, `signature ${approved.approval!.manifestDigest}`]
  return { manifest: approved, lines }
}
