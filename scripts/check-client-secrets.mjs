import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';

config({ path: '.env.local' });

const STATIC_DIR = '.next/static';
const NEEDLES = ['SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY].filter(
  (n) => typeof n === 'string' && n.length > 0,
);

if (!existsSync(STATIC_DIR)) {
  console.error(`${STATIC_DIR} not found. Run \`pnpm build\` first.`);
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

let leaks = 0;
for (const file of walk(STATIC_DIR)) {
  const text = readFileSync(file, 'utf8');
  for (const needle of NEEDLES) {
    if (text.includes(needle)) {
      const label =
        needle === process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service role key value' : needle;
      console.error(`LEAK: ${label} found in ${file}`);
      leaks++;
    }
  }
}

if (leaks > 0) {
  console.error(`${leaks} secret leak(s) in client bundles`);
  process.exit(1);
}
console.log('No server secrets found in client bundles');
