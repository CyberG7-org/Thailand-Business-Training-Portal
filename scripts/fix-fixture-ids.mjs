// Gives every fictional 13-digit id in tests and the fake extractor a valid check digit (P17c).
// Keeps the first twelve digits where possible; when the valid id would collide with another id
// in use, bumps the twelfth digit until it is unique. Idempotent. Run: node scripts/fix-fixture-ids.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const check = (first12) => {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (13 - i);
  return (11 - (sum % 11)) % 10;
};
const valid = (id) => check(id.slice(0, 12)) === Number(id[12]);
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
// The validators' own tests hold deliberately invalid ids: leave them alone.
const files = [...walk('tests'), ...walk('lib/integrations/extraction')].filter(
  (f) => /\.(ts|tsx|mts)$/.test(f) && !f.includes(join('tests', 'unit', 'domain', 'validation')),
);
const used = new Set();
const invalid = new Set();
for (const f of files) {
  for (const m of readFileSync(f, 'utf8').matchAll(/\b(\d{13})\b/g)) {
    used.add(m[1]);
    if (!valid(m[1])) invalid.add(m[1]);
  }
}
const mapping = new Map();
for (const id of invalid) {
  let prefix = BigInt(id.slice(0, 12));
  let candidate;
  do {
    const p = prefix.toString().padStart(12, '0');
    candidate = p + check(p);
    prefix += 1n;
  } while (used.has(candidate) || [...mapping.values()].includes(candidate));
  mapping.set(id, candidate);
}
for (const f of files) {
  let s = readFileSync(f, 'utf8');
  let changed = false;
  for (const [from, to] of mapping) {
    if (s.includes(from)) {
      s = s.split(from).join(to);
      changed = true;
    }
  }
  if (changed) {
    writeFileSync(f, s);
    console.log('fixed', relative('.', f));
  }
}
for (const [from, to] of mapping) console.log(`${from} -> ${to}`);
