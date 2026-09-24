/**
 * p77 STORY-036 — the §7.6 mechanical inventory as CODE (feedback P77-21).
 * Each app carries a copy of this scanner (a polyrepo shares no test code);
 * the patterns are identical everywhere and identical to
 * `yobo-auth/scripts/p77/writer-inventory.sh`.
 *
 * P77-21 (resolved at build). The round-4 greps could not prove completeness:
 * they missed credential CLEARS (`password: null`, `connectSub: null`, a
 * multi-line `.set({ … password … })`), the PROVISIONING writers
 * (`setCredentialAndLoginRole`), and excluded whole classes by path or name
 * (`mock|fixture`, seeds, "non-session" signers such as `signPreAuthToken`).
 * The mechanism now:
 *   1. WRITERS adds clears and provisioning calls; MINTS adds jose's
 *      `new SignJWT(` — every signer is a hit, none is excluded wholesale.
 *   2. A BLOCK scan: every `.set({` whose object spans lines is read to its
 *      closing paren; a `password` / `connectSub` / `connect_sub` key inside it
 *      is a hit even when no single line matches.
 *   3. EXCL drops ONLY test files (`.test.`, `__tests__`, `.spec.`, `/test/`,
 *      `/tests/`) — never `mock` or `fixture`, and never seeds: a seed, a
 *      non-credential hash (client secrets, OTP codes) or a non-session signer
 *      (logout / operator / pre-auth tokens) is an EXPLICIT allowlist entry
 *      with its reason, so a new one is a failure until someone classifies it.
 *   4. Comment lines are not code and are skipped.
 *   5. Allowlist entries are anchored by file + a substring of the hit line
 *      (line numbers float); an entry that matches nothing fails too, so the
 *      list cannot rot into a superset.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const WRITERS =
  /bcrypt\.hash\(|hashPassword\(|updatePassword\(|setInitialPassword|passwordHash|hashedPassword|password: *hash|\.set\(\{[^}]*\bpassword:|\bpassword: *null|connectSub: *null|connect_sub *= *NULL|setCredentialAndLoginRole\(/;
export const MINTS =
  /jwt\.sign\(|signPreAuthToken\(|CredentialsProvider\(|consumeLoginToken|consumeEntryToken|generate-token|api\/auth\/bridge|token-exchange|encode\(\{|new SignJWT\(/;
export const EXCL = /\.test\.|__tests__|\.spec\.|\/test\/|\/tests\//;
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const BLOCK_KEY = /(^|[\s{,(])(password|connectSub|connect_sub)\s*[:,}\n]/m;

export type HitKind = "writer" | "mint" | "set-block";
export interface Hit {
  kind: HitKind;
  file: string;
  line: number;
  text: string;
}

export type AllowRole =
  | "sdk-seam" // an SDK writer/factory — gated inside @jetdevs/core's withCredentialWrite
  | "gated" // an app writer or mint behind the maintenance gate
  | "seed" // a seed script (never runs per request)
  | "non-credential" // a hash of something that is not a sign-in credential
  | "non-session" // a signer / reference that issues no session
  | "consumer"; // consumes a mint issued elsewhere (admitted by design)

export interface AllowEntry {
  kind: HitKind;
  file: string;
  /** A substring of the hit line. */
  contains: string;
  role: AllowRole;
  why: string;
}

function isComment(line: string): boolean {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

/** Every hit in one file's content. `file` is the repo-relative path. */
export function scanSource(file: string, content: string): Hit[] {
  if (EXCL.test(file)) return [];
  const hits: Hit[] = [];
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    if (isComment(line)) return;
    const text = line.trim();
    if (WRITERS.test(line)) hits.push({ kind: "writer", file, line: i + 1, text });
    if (MINTS.test(line)) hits.push({ kind: "mint", file, line: i + 1, text });
    const at = line.indexOf(".set({");
    if (at >= 0 && !WRITERS.test(line)) {
      let depth = 0;
      let block = "";
      for (let j = i; j < Math.min(lines.length, i + 60); j++) {
        const l = j === i ? line.slice(at + 4) : lines[j]!;
        block += `${l}\n`;
        for (const ch of l) {
          if (ch === "(") depth++;
          else if (ch === ")") depth--;
        }
        if (depth <= 0) break;
      }
      if (BLOCK_KEY.test(block)) hits.push({ kind: "set-block", file, line: i + 1, text });
    }
  });
  return hits;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (e !== "node_modules" && e !== ".next" && e !== "dist") walk(p, out);
    } else if (SOURCE.test(e)) out.push(p);
  }
  return out;
}

/** Every hit under `dirs` (repo-relative) of the working tree at `root`. */
export function scanTree(root: string, dirs: string[] = ["src"]): Hit[] {
  const hits: Hit[] = [];
  for (const d of dirs) {
    for (const f of walk(join(root, d))) {
      const rel = relative(root, f).split("\\").join("/");
      hits.push(...scanSource(rel, readFileSync(f, "utf8")));
    }
  }
  return hits;
}

const matches = (h: Hit, a: AllowEntry) => a.kind === h.kind && a.file === h.file && h.text.includes(a.contains);

/** Hits no allowlist entry covers — each one a writer or mint nobody classified. */
export function unlistedHits(hits: Hit[], allow: AllowEntry[]): Hit[] {
  return hits.filter((h) => !allow.some((a) => matches(h, a)));
}

/** Allowlist entries that match no hit (stale: the code moved or went away). */
export function unusedEntries(hits: Hit[], allow: AllowEntry[]): AllowEntry[] {
  return allow.filter((a) => !hits.some((h) => matches(h, a)));
}

export function describeHits(hits: Hit[]): string {
  return hits.map((h) => `${h.kind} ${h.file}:${h.line} ${h.text.slice(0, 120)}`).join("\n");
}

/** A synthetic file with one of everything the inventory must catch (AC14 / AC17). */
export const FIXTURE_FILE = "src/lib/p77-inventory-fixture.ts";
export const FIXTURE_SOURCE = [
  "export async function sneaky(db: any, users: any, pw: string, id: number, newHash: string) {",
  "  const h = await bcrypt.hash(pw, 10);", // 2 writer
  "  const t = jwt.sign({ id }, 'secret');", // 3 mint
  "  await db.update(users).set({ password: null }).where(id);", // 4 writer (clear)
  "  await db.update(users).set({", // 5 set-block (multi-line)
  "    name: 'x',",
  "    password: newHash,",
  "  });",
  "  await setCredentialAndLoginRole(client, { sub: '1', password: pw });", // 9 writer (provisioning)
  "  const p = await signPreAuthToken({ userId: id });", // 10 mint
  "  const s = await new SignJWT({ id }).sign(key);", // 11 mint
  "  await db.update(users).set({ connectSub: null });", // 12 writer (clear)
  "}",
].join("\n");
