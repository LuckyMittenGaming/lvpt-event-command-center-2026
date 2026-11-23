import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const roots = ['app', 'services', 'components', 'public', 'apps-script', 'lib'];

function files(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files(path, found);
    else if (/\.(js|mjs|cjs|ts|tsx|html|css|gs)$/.test(entry)) found.push(path);
  }
  return found;
}

test('the production command center does not import the relay', () => {
  const hits = [];
  for (const folder of roots) {
    for (const path of files(join(root, folder))) {
      const text = readFileSync(path, 'utf8');
      if (text.includes('agent-review-relay') || text.includes('handleSignedDelivery')) hits.push(path);
    }
  }
  assert.deepEqual(hits, []);
});
