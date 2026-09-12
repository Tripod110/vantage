const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ URL });
vm.runInContext(readFileSync(require('node:path').join(__dirname, '../steamid.js'), 'utf8'), context);

test('account ID, SteamID64, and supplied profile all resolve to the same account', () => {
  for (const input of ['186993885', '76561198147259613',
    'https://steamcommunity.com/profiles/76561198147259613/',
    ' steamcommunity.com/profiles/76561198147259613 ',
    'https://www.steamcommunity.com/profiles/76561198147259613?l=english#summary']) {
    assert.equal(context.toAccountId(input), 186993885, input);
  }
});
test('invalid IDs and misleading links cannot load a different account', () => {
  for (const input of [null, '', '0', '-1', '1.5', '4294967296', '76561197960265728',
    '76561202255233024', '99999999999999999999999999',
    'https://evil.test/profiles/76561198147259613',
    'https://steamcommunity.com.evil.test/profiles/76561198147259613',
    'https://steamcommunity.com@evil.test/profiles/76561198147259613',
    'https://steamcommunity.com/id/someone',
    'https://steamcommunity.com/profiles/186993885',
    'https://steamcommunity.com/profiles/76561198147259613/inventory']) {
    assert.equal(context.toAccountId(input), null, String(input));
  }
});
test('unsigned account boundaries preserve exact SteamID64 conversion', () => {
  for (const id of [1, 186993885, 4294967295]) {
    assert.equal(context.toAccountId(context.toSteamId64(id)), id);
  }
});
