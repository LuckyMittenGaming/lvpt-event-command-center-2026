import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  resolveEventTimeZone,
  decodeSheetsWallClock,
  formatWallClock,
  formatEventTime,
  formatEventDateTime,
  formatEventDate
} = require('../public/v2/js/event-datetime.js');

// Sheets epoch wall-clock via fixed UTC-5
const five = decodeSheetsWallClock('1899-12-30T22:00:00.000Z');
assert.equal(five.valid, true);
assert.equal(five.hour, 17);
assert.equal(five.minute, 0);
assert.equal(formatWallClock(five.hour, five.minute, 'America/Los_Angeles'), '5:00 PM PT');
assert.equal(formatEventTime('1899-12-30T22:00:00.000Z', { city: 'Las Vegas', state: 'NV' }), '5:00 PM PT');

const six = decodeSheetsWallClock('1899-12-30T23:00:00.000Z');
assert.equal(six.hour, 18);
assert.equal(formatEventTime('1899-12-30T23:00:00.000Z', 'PT'), '6:00 PM PT');

const nine = decodeSheetsWallClock('1899-12-31T02:00:00.000Z');
assert.equal(nine.hour, 21);
assert.equal(formatEventTime('1899-12-31T02:00:00.000Z', { state: 'NV' }), '9:00 PM PT');

// Offset / Z variants still decode
assert.equal(decodeSheetsWallClock('1899-12-30T22:00:00Z').hour, 17);
assert.equal(decodeSheetsWallClock('1899-12-30T22:00:00.000+00:00').hour, 17);

// Plain HH:MM
assert.deepEqual(decodeSheetsWallClock('14:30'), { hour: 14, minute: 30, second: 0, valid: true });
assert.equal(formatWallClock(14, 30, 'America/New_York'), '2:30 PM ET');

// Zone resolution
assert.equal(resolveEventTimeZone({ city: 'New York', state: 'NY' }), 'America/New_York');
assert.equal(resolveEventTimeZone({ timeZone: 'ET' }), 'America/New_York');
assert.equal(resolveEventTimeZone({ city: 'Phoenix', state: 'AZ' }), 'America/Phoenix');
assert.equal(resolveEventTimeZone({ timezone: 'MST' }), 'America/Phoenix');
assert.equal(resolveEventTimeZone({ city: 'Chicago' }), 'America/Chicago');
assert.equal(resolveEventTimeZone({ city: 'Denver' }), 'America/Denver');
assert.equal(resolveEventTimeZone({ city: 'Las Vegas', state: 'NV' }), 'America/Los_Angeles');
assert.equal(resolveEventTimeZone({ setup: { timeZone: 'America/Chicago' } }), 'America/Chicago');
assert.equal(resolveEventTimeZone({}), 'America/Los_Angeles');

// Abbreviations in format
assert.equal(formatEventTime('17:00', { city: 'Boston', state: 'MA' }), '5:00 PM ET');
assert.equal(formatEventTime('17:00', { city: 'Phoenix', state: 'AZ' }), '5:00 PM MST');
assert.equal(formatEventTime('17:00', 'America/Phoenix'), '5:00 PM MST');
assert.equal(formatEventTime('1899-12-30T22:00:00.000Z', { city: 'New York' }), '5:00 PM ET');

// Date / datetime formatting
assert.equal(formatEventDate('2025-09-25', 'America/Los_Angeles'), 'Sep 25, 2025');
assert.equal(formatEventDateTime('2025-09-25', { state: 'NV' }), 'Sep 25, 2025');
const stamped = formatEventDateTime('2025-09-25T21:10:00.000Z', { city: 'Las Vegas', state: 'NV' });
assert.match(stamped, /^Sep 25, 2025 · 2:10 PM PT$/);

console.log('event-datetime.test.mjs: ok');
