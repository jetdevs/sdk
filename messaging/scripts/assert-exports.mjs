#!/usr/bin/env node
/**
 * Superset export gate (org-attribution S0, scout opportunity N2).
 *
 * The @jetdevs/messaging 0.3.x (platform console) and 0.4.x (webchat) lines
 * once diverged on GHP — a publish from either line silently dropped the
 * other's surface. This script asserts every symbol in required-exports.json
 * is present in the built dist/index.d.ts and exits non-zero otherwise.
 * Wired to `prepublishOnly` so a non-superset publish is mechanically blocked.
 *
 * Usage: node scripts/assert-exports.mjs   (from the messaging package root)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(pkgRoot, 'scripts/required-exports.json'), 'utf8'));

let dts;
const dtsPath = join(pkgRoot, manifest.dtsFile);
try {
  dts = readFileSync(dtsPath, 'utf8');
} catch {
  console.error(`assert-exports: FAIL — ${manifest.dtsFile} not found. Run \`pnpm build\` first.`);
  process.exit(1);
}

const missing = [];
for (const entry of manifest.required) {
  const present = new RegExp(entry.pattern).test(dts);
  console.log(`${present ? '  ok   ' : 'MISSING'}  ${entry.symbol}  [${entry.surface}]`);
  if (!present) missing.push(entry);
}

if (missing.length > 0) {
  console.error(
    `\nassert-exports: FAIL — ${missing.length}/${manifest.required.length} required symbol(s) missing from ${manifest.dtsFile}.` +
      `\nThe build is NOT a superset of both published lines — do NOT publish.` +
      `\nReconcile to the union (see _context/yobo-crm/messaging/org-attribution/wargame.md §0) and rebuild.`,
  );
  process.exit(1);
}
console.log(`\nassert-exports: PASS — all ${manifest.required.length} required symbols present in ${manifest.dtsFile}.`);
