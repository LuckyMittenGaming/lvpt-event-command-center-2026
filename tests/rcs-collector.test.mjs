import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join('services', 'google-messages-collector');
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith('.go') && !path.endsWith('_test.go')) files.push(readFileSync(path, 'utf8'));
  }
}
walk(root);
const source = files.join('\n');
for (const forbidden of ['SendMessage(', 'MarkRead(', 'SendReaction(', 'DeleteMessage(', 'SetTyping(', 'lvpt_sms_staging', 'TaskSync', 'GmailApp']) {
  assert.equal(source.includes(forbidden), false, forbidden);
}
assert.equal(source.includes('ed5dc19eb2b4149ee242cf000c86a7150dca9947'), true);
assert.equal(source.includes('possible_duplicate'), true);

const route = readFileSync('app/api/sms/staging/rcs-collector/route.ts', 'utf8');
assert.equal(route.includes("pairing: 'unpaired'"), true);
assert.equal(route.includes('sendEnabled: false'), true);
assert.equal(route.includes('existingSmsRewritten: false'), true);
assert.equal(route.includes('lvpt_sms_staging'), false);
assert.equal(route.includes('preview_only'), true);

const hub = readFileSync('public/v2/js/unified-hub.js', 'utf8');
assert.equal(hub.includes('/api/sms/staging/rcs-collector'), true);
assert.equal(hub.includes('Google Messages collector'), true);

console.log('rcs collector isolation tests passed');
